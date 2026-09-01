import type {
  DanmakuMessage,
  DanmakuRejectReason,
  RoomCount,
  ServerEvent,
} from '../domain/protocol';
import { defaultRoomId, type StudyRoomId } from '../domain/rooms';
import type { StudyRoomTransport, TransportStatus } from '../data/sseTransport';

/**
 * 自习室控制器（框架无关，注入 transport，node 可测）：连接生命周期、
 * 指数退避重连（每次重读 token——30min access token 过期后服务端会主动
 * 断开，重连即无缝换新 token）、断线发送队列、snapshot/presence 状态收敛。
 * 弹幕本身是瞬态 UI 内容，不走 React 状态——经 onDanmaku 出口交给
 * DanmakuLayer 滚动渲染。
 */

export type StudyRoomStatus = 'idle' | 'connecting' | 'open' | 'reconnecting';

export interface StudyRoomState {
  readonly status: StudyRoomStatus;
  readonly roomId: StudyRoomId;
  readonly onlineCount: number;
  readonly authed: boolean;
  readonly roomCounts: readonly RoomCount[];
  /** 本地乐观冷却（发送即置位；服务端 reject 校正） */
  readonly sendCooldownUntil: number;
  readonly lastReject: {
    readonly reason: DanmakuRejectReason;
    readonly retryAfterSeconds: number | null;
    readonly at: number;
  } | null;
}

export type DanmakuOrigin = 'history' | 'live';

export interface StudyRoomController {
  subscribe(listener: () => void): () => void;
  getState(): StudyRoomState;
  /** 弹幕事件出口：history = join 快照错峰回放；live = 实时广播。返回退订函数。 */
  onDanmaku(listener: (message: DanmakuMessage, origin: DanmakuOrigin) => void): () => void;
  actions: {
    /** 进入指定房间（列表页选中后调用）；断线重连一直指向该房间。 */
    enter(roomId: StudyRoomId): void;
    send(content: string): void;
    leave(): void;
  };
}

const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 15_000;
const SEND_QUEUE_LIMIT = 10;
const SEND_COOLDOWN_MS = 3000;

export function createStudyRoomController(deps: {
  transport: StudyRoomTransport;
  resolveUrl: () => string;
  readToken: () => Promise<string | null>;
  now?: () => number;
}): StudyRoomController {
  const now = deps.now ?? Date.now;
  let desired = false;
  let attempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  const sendQueue: string[] = [];

  let state: StudyRoomState = {
    status: 'idle',
    roomId: defaultRoomId(),
    onlineCount: 0,
    authed: false,
    roomCounts: [],
    sendCooldownUntil: 0,
    lastReject: null,
  };
  /** 期望房间：enter 显式指定；重连握手 query 始终带上它 */
  let desiredRoom: StudyRoomId = defaultRoomId();

  const listeners = new Set<() => void>();
  const danmakuListeners = new Set<(message: DanmakuMessage, origin: DanmakuOrigin) => void>();

  function emit(): void {
    for (const listener of listeners) listener();
  }

  function patch(next: Partial<StudyRoomState>): void {
    state = { ...state, ...next };
    emit();
  }

  function clearReconnectTimer(): void {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function connect(): void {
    clearReconnectTimer();
    patch({ status: attempts === 0 ? 'connecting' : 'reconnecting' });
    void deps
      .readToken()
      .then((token) => {
        const url = new URL(deps.resolveUrl());
        url.searchParams.set('room', desiredRoom);
        deps.transport.connect({
          url: url.toString(),
          token,
          onEvent,
          onStatus,
        });
      })
      .catch(() => scheduleReconnect());
  }

  function scheduleReconnect(): void {
    if (!desired) return;
    const backoff = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** attempts);
    const jitter = Math.random() * 250;
    attempts += 1;
    patch({ status: 'reconnecting' });
    reconnectTimer = setTimeout(connect, backoff + jitter);
  }

  function onStatus(status: TransportStatus): void {
    if (!desired) return;
    if (status === 'open') {
      attempts = 0;
      patch({ status: 'open' });
      // 断线积压的发送按序补发（超出上限的旧弹幕已丢弃）
      while (sendQueue.length > 0) {
        const content = sendQueue.shift();
        if (content !== undefined) deps.transport.send({ type: 'danmaku.send', content });
      }
      return;
    }
    if (status === 'closed') scheduleReconnect();
  }

  function onEvent(event: ServerEvent): void {
    switch (event.type) {
      case 'snapshot': {
        patch({
          roomId: event.roomId,
          onlineCount: event.onlineCount,
          authed: event.authed,
          roomCounts: event.rooms,
        });
        for (const message of event.messages) {
          for (const listener of danmakuListeners) listener(message, 'history');
        }
        return;
      }
      case 'danmaku.new':
        for (const listener of danmakuListeners) listener(event.message, 'live');
        return;
      case 'presence.update':
        if (event.roomId === state.roomId) patch({ onlineCount: event.onlineCount });
        return;
      case 'presence.rooms':
        patch({ roomCounts: event.rooms });
        return;
      case 'danmaku.rejected': {
        const retryAfterSeconds = event.retryAfterSeconds ?? null;
        const cooldownMs = (event.retryAfterSeconds ?? SEND_COOLDOWN_MS / 1000) * 1000;
        patch({
          lastReject: { reason: event.reason, retryAfterSeconds, at: now() },
          sendCooldownUntil: event.reason === 'cooldown' ? now() + cooldownMs : state.sendCooldownUntil,
        });
        return;
      }
      case 'error':
      case 'pong':
        return;
    }
  }

  const controller: StudyRoomController = {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getState() {
      return state;
    },
    onDanmaku(listener) {
      danmakuListeners.add(listener);
      return () => danmakuListeners.delete(listener);
    },
    actions: {
      enter(roomId) {
        desiredRoom = roomId;
        patch({ roomId, onlineCount: 0 });
        desired = true;
        attempts = 0;
        connect();
      },
      send(content) {
        patch({ sendCooldownUntil: now() + SEND_COOLDOWN_MS });
        if (state.status === 'open') {
          deps.transport.send({ type: 'danmaku.send', content });
          return;
        }
        // 未连接：入队等待 open 后补发（超限丢最旧）
        sendQueue.push(content);
        if (sendQueue.length > SEND_QUEUE_LIMIT) sendQueue.shift();
      },
      leave() {
        desired = false;
        clearReconnectTimer();
        sendQueue.length = 0;
        deps.transport.close();
        patch({ status: 'idle', onlineCount: 0, roomCounts: [] });
      },
    },
  };

  return controller;
}
