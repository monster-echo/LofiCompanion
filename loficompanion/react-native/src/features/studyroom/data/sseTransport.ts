import EventSource from 'react-native-sse';
import {
  parseServerEvent,
  type ClientEvent,
  type ServerEvent,
} from '../domain/protocol';
import { danmakuRejectFromServer } from '../domain/danmakuReject';
import { ApiClientError, apiClient } from '../../../data/apiClient';

/**
 * 自习室 SSE 传输层（替代原 WS 传输，2026-09）：GET text/event-stream 流式读
 * 服务端推送（snapshot/presence/danmaku.new），发弹幕走 POST /api/studyroom/danmaku。
 * 断线重连/退避仍由上层 controller 负责——生命周期契约与 wsTransport 一致
 * （connect/send/close + onStatus），controller 零改动。
 *
 * 流用 react-native-sse（纯 JS XHR 流式，无原生模块）→ **Expo Go / dev-client /
 * 生产包都能跑**（之前 expo/fetch 需原生模块，Expo Go 连不上）。react-native-sse
 * 会按 SSE 规范自行重连——这层主动 close 掐断内部重连，把重连交还 controller
 * （重连时重读 30min token）。
 */

export type TransportStatus = 'connecting' | 'open' | 'closed';

export interface StudyRoomTransport {
  connect(args: {
    url: string;
    token: string | null;
    onEvent: (event: ServerEvent) => void;
    onStatus: (status: TransportStatus) => void;
  }): void;
  send(event: ClientEvent): void;
  close(): void;
}

/** 传输层只依赖的事件源子集（react-native-sse 的 EventSource 满足；测试可注入假源）。 */
interface MessageLike {
  type: string;
  data?: string | null;
}
export interface SseSourceLike {
  addEventListener(type: string, listener: (event: MessageLike) => void): void;
  close(): void;
}

export interface SseTransportDeps {
  /** 注入用（vitest）；缺省 real react-native-sse。 */
  createSource?: (url: string, token: string | null) => SseSourceLike;
  /** 注入用；缺省走 apiClient.danmakuSend（401 自动刷新重试 + 标准错误信封）。 */
  sendDanmaku?: (roomId: string, content: string) => Promise<unknown>;
}

export function createSseTransport(deps: SseTransportDeps = {}): StudyRoomTransport {
  let current: SseSourceLike | null = null;
  let onEvent: ((event: ServerEvent) => void) | null = null;
  let onStatus: ((status: TransportStatus) => void) | null = null;
  let roomId: string | null = null;

  /** 掐断当前流 + 清回调（connect/close/流结束共用；不再触发 onStatus）。 */
  function teardown(): void {
    if (current !== null) {
      try {
        current.close();
      } catch {
        // 源的 close 不允许抛
      }
      current = null;
    }
    onEvent = null;
    onStatus = null;
    roomId = null;
  }

  return {
    connect(args) {
      teardown();
      onEvent = args.onEvent;
      onStatus = args.onStatus;
      let source: SseSourceLike;
      try {
        source = deps.createSource
          ? deps.createSource(args.url, args.token)
          : (new EventSource(args.url, {
              headers: args.token ? { Authorization: `Bearer ${args.token}` } : {},
            }) as unknown as SseSourceLike);
      } catch (error) {
        console.info('[studyroom-sse] create source failed', error);
        onStatus?.('closed');
        return;
      }
      current = source;
      if (current === null) return;
      roomId = new URL(args.url).searchParams.get('room');
      onStatus('connecting');
      console.info('[studyroom-sse] connect', roomId, args.token ? 'authed' : 'guest');

      source.addEventListener('open', () => {
        if (current !== source) return;
        console.info('[studyroom-sse] open', roomId);
        onStatus?.('open');
      });
      source.addEventListener('message', (event) => {
        if (current !== source) return;
        const payload = event.data;
        if (payload === null || payload === undefined) return;
        const parsed = parseServerEvent(payload);
        if (parsed !== null) onEvent?.(parsed);
        else console.info('[studyroom-sse] unparsed frame', String(payload).slice(0, 120));
      });
      // 掐断内部重连：error/close 一律把连接交还 controller（重读 token 走退避）
      const finish = () => {
        if (current !== source) return;
        console.info('[studyroom-sse] stream ended', roomId);
        const emitClosed = onStatus;
        teardown();
        emitClosed?.('closed');
      };
      source.addEventListener('error', () => {
        if (current !== source) return;
        finish(); // teardown 会 close 掉源（掐断 react-native-sse 的内部自动重连）
      });
      source.addEventListener('close', finish);
    },

    send(event) {
      // SSE 无心跳/换房通道：heartbeat 概念取消，room.switch 由 controller 从不下发。
      if (event.type !== 'danmaku.send') return;
      if (roomId === null || onEvent === null) return;
      const room = roomId;
      const poster = deps.sendDanmaku ?? defaultSendDanmaku;
      void poster(room, event.content).catch((error: unknown) => {
        const code = error instanceof ApiClientError ? error.code : 'INTERNAL_ERROR';
        const retryAfterSeconds =
          error instanceof ApiClientError ? error.retryAfterSeconds : undefined;
        const { reason, retryAfterSeconds: retry } = danmakuRejectFromServer(
          code,
          retryAfterSeconds,
        );
        onEvent?.({
          type: 'danmaku.rejected',
          reason,
          ...(retry !== undefined ? { retryAfterSeconds: retry } : {}),
        });
      });
    },

    close() {
      teardown();
    },
  };
}

async function defaultSendDanmaku(roomId: string, content: string): Promise<unknown> {
  return apiClient.danmakuSend(roomId, content);
}