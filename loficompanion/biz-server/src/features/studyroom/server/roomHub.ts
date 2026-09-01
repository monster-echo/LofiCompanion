// 自习室 presence/广播中枢（SSE 版，原 src/ws/server.ts 的连接/广播语义搬迁）：
// 在线数、弹幕广播、presence 防抖、token 过期宽限关流——全部在进程内内存态。
// 单实例约束（与 WS 时代相同，且更关键）：hub 现在住在 Next REST 进程里，
// 禁止多 worker / 多副本横向扩容（会拆散房间成员表；多副本需 Redis pub/sub）。

import type { BizIdentity } from '../../../auth/jwt';
import { STUDY_ROOM_IDS, type StudyRoomId } from '../domain/rooms';
import { CooldownGate } from './cooldown';
import { encodeServerEvent, type RoomCount, type ServerEvent } from './protocol';

export const PRESENCE_DEBOUNCE_MS = 2000;
export const TOKEN_EXPIRY_GRACE_MS = 60_000;
export const SEND_COOLDOWN_MS = 3000;
// SSE 无客户端帧：用服务端 : ping 探活——25s 踢一帧（低于常见 60s 代理空闲），
// 死 socket 的写会抛 → push 返回 false → 自动 leave。
const PING_INTERVAL_MS = 25_000;
const SWEEP_INTERVAL_MS = 15_000;
// 没有任何写入成功的 90s 视为死链兜底（TCP 静默半开，res close/cancel 都唤不到的极端情形）。
const STALE_AFTER_MS = 90_000;

/** 流的写入口：route 用 ReadableStreamDefaultController 包一个实现。 */
export interface StreamWriter {
  /** 追加一帧 SSE 完整文本；false = 流已死（enqueue 抛/已 close），调用方应 leave。 */
  write(frame: string): boolean;
  /** 是否已由 route 侧（客户端断开）关闭。 */
  readonly closed: boolean;
  /** 服务端主动关流（token 过期）：只结束写入，不广播 presence。 */
  close(): void;
}

export interface AttachedStream {
  readonly id: number;
  readonly room: StudyRoomId;
  readonly identity: BizIdentity | null; // null = 访客（计入在线、只读）
  /** 幂等；触发本房 presence 防抖。 */
  leave(): void;
  /** 推事件到该流；false = 流已离开/已死。 */
  push(event: ServerEvent): boolean;
}

interface StreamState {
  id: number;
  room: StudyRoomId;
  identity: BizIdentity | null;
  writer: StreamWriter;
  left: boolean;
  expiryTimer: NodeJS.Timeout | null;
  lastWriteAtMs: number;
}

// ── 模块态（单实例）───────────────────────────────────────────────────────

const streams = new Set<StreamState>();
const roomMembers = new Map<StudyRoomId, Set<StreamState>>(
  STUDY_ROOM_IDS.map((id) => [id, new Set<StreamState>()]),
);
/** 全进程共用冷却闸（同 userId 每个窗口一条）；与 WS 时代同一实例语义。 */
const cooldown = new CooldownGate(Date.now, SEND_COOLDOWN_MS);

const dirtyRooms = new Set<StudyRoomId>();
let presenceTimer: NodeJS.Timeout | null = null;
let maintenanceTimer: NodeJS.Timeout | null = null;
let idSeq = 0;

// 时钟可注入（node --test 挪时间；生产不动）。
let clock: () => number = Date.now;
/** 仅测试：替换模块时钟并清空全部状态（node --test 每个文件独立进程）。 */
export function resetHubForTests(nextNow?: () => number): void {
  for (const s of streams) {
    if (s.expiryTimer !== null) clearTimeout(s.expiryTimer);
  }
  streams.clear();
  for (const members of roomMembers.values()) members.clear();
  dirtyRooms.clear();
  if (presenceTimer !== null) {
    clearTimeout(presenceTimer);
    presenceTimer = null;
  }
  if (maintenanceTimer !== null) {
    clearInterval(maintenanceTimer);
    maintenanceTimer = null;
  }
  clock = nextNow ?? Date.now;
}

function onlineCount(room: StudyRoomId): number {
  return roomMembers.get(room)?.size ?? 0;
}

export function allCounts(): RoomCount[] {
  return STUDY_ROOM_IDS.map((roomId) => ({ roomId, onlineCount: onlineCount(roomId) }));
}

// ── presence 变更：脏房间集合 + 2s 防抖（对齐 WS 算法）──────────────────────

function schedulePresenceBroadcast(rooms: Iterable<StudyRoomId>): void {
  for (const room of rooms) dirtyRooms.add(room);
  if (presenceTimer !== null) return;
  presenceTimer = setTimeout(flushPresence, PRESENCE_DEBOUNCE_MS);
  presenceTimer.unref();
}

function flushPresence(): void {
  presenceTimer = null;
  for (const roomId of dirtyRooms) {
    broadcastRoom(roomId, { type: 'presence.update', roomId, onlineCount: onlineCount(roomId) });
  }
  dirtyRooms.clear();
  broadcastAll({ type: 'presence.rooms', rooms: allCounts() });
}

// ── 广播 ──────────────────────────────────────────────────────────────────

export function broadcastRoom(roomId: StudyRoomId, event: ServerEvent): void {
  for (const member of roomMembers.get(roomId) ?? []) {
    push(member, event);
  }
}

export function broadcastAll(event: ServerEvent): void {
  for (const stream of streams) {
    push(stream, event);
  }
}

// ── join / leave / push ───────────────────────────────────────────────────

export function joinRoomStream(args: {
  room: StudyRoomId;
  identity: BizIdentity | null;
  expiresAtMs: number | null;
  writer: StreamWriter;
  now?: () => number;
}): AttachedStream {
  const state: StreamState = {
    id: ++idSeq,
    room: args.room,
    identity: args.identity,
    writer: args.writer,
    left: false,
    expiryTimer: null,
    lastWriteAtMs: (args.now ?? clock)(),
  };
  streams.add(state);
  roomMembers.get(args.room)?.add(state);
  schedulePresenceBroadcast([args.room]);

  if (args.expiresAtMs !== null) {
    const ttlMs = args.expiresAtMs + TOKEN_EXPIRY_GRACE_MS - (args.now ?? clock)();
    if (ttlMs <= 0) {
      closeForExpiry(state);
    } else {
      state.expiryTimer = setTimeout(() => closeForExpiry(state), ttlMs);
      state.expiryTimer.unref();
    }
  }

  const attached: AttachedStream = {
    id: state.id,
    room: state.room,
    identity: state.identity,
    leave: () => leave(state),
    push: (event: ServerEvent) => push(state, event),
  };
  return attached;
}

function push(state: StreamState, event: ServerEvent): boolean {
  if (state.left || state.writer.closed) return false;
  const ok = state.writer.write(`data: ${encodeServerEvent(event)}\n\n`);
  if (ok) {
    state.lastWriteAtMs = clock();
    return true;
  }
  leave(state);
  return false;
}

function leave(state: StreamState): void {
  if (state.left) return;
  state.left = true;
  if (state.expiryTimer !== null) {
    clearTimeout(state.expiryTimer);
    state.expiryTimer = null;
  }
  streams.delete(state);
  roomMembers.get(state.room)?.delete(state);
  schedulePresenceBroadcast([state.room]);
}

/** token 到期（含宽限内）：先推终止事件让客户端感知，再于服务端关流。 */
function closeForExpiry(state: StreamState): void {
  if (state.left) return;
  push(state, {
    type: 'error',
    code: 'TOKEN_EXPIRED',
    message: '登录已过期，正在重新连接',
  });
  state.writer.close();
  leave(state);
}

// ── 维护：: ping 探活 + 陈旧清扫 + presence.rooms 周期兜底（对齐 WS sweeper）──

export function ensureHubMaintenance(intervalMs = SWEEP_INTERVAL_MS): void {
  if (maintenanceTimer !== null) return;
  maintenanceTimer = setInterval(() => {
    const nowMs = clock();
    for (const state of streams) {
      // 健康流每 25s 成功写一次探活帧 → lastWriteAtMs 刷新；
      // 写失败（enqueue 抛）说明 socket 已死 → 立即 leave。
      if (!state.writer.closed) {
        const ok = state.writer.write(': ping\n\n');
        if (ok) state.lastWriteAtMs = nowMs;
        else {
          leave(state);
          continue;
        }
      }
      // 兜底：90s 没有任何成功写入（静默半开连接，写不报错的极端情形）
      if (nowMs - state.lastWriteAtMs > STALE_AFTER_MS) {
        leave(state);
      }
    }
    broadcastAll({ type: 'presence.rooms', rooms: allCounts() });
  }, intervalMs);
  maintenanceTimer.unref();
}

export function getCooldown(): CooldownGate {
  return cooldown;
}