import {
  parseServerEvent,
  type ClientEvent,
  type ServerEvent,
} from '../domain/protocol';
import { createSseParser } from '../domain/sse';
import { danmakuRejectFromServer } from '../domain/danmakuReject';
import { ApiClientError, apiClient } from '../../../data/apiClient';

/**
 * 自习室 SSE 传输层（替代原 WS 传输，2026-09）：GET text/event-stream 流式读
 * 服务端推送（snapshot/presence/danmaku.new），发弹幕走 POST /api/studyroom/danmaku。
 * 断线重连/退避仍由上层 controller 负责——这里的生命周期契约与 wsTransport
 * 完全一致（connect/send/close + onStatus），controller 零改动。
 *
 * 流用 expo/fetch（SDK57 原生流式 body），普通 header 带 Bearer（无 EventSource
 * 限头问题）；vitest 注入 fetchImpl 上测试，expo/fetch 在 RN 运行时懒加载。
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

interface StreamResponseLike {
  readonly ok: boolean;
  readonly status: number;
  readonly body: ReadableStream<Uint8Array> | null;
}

type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal; cache?: string },
) => Promise<StreamResponseLike>;

export interface SseTransportDeps {
  /** 注入用（vitest）；缺省懒加载 expo/fetch。 */
  fetchImpl?: FetchLike;
  /** 注入用；缺省走 apiClient.danmakuSend（401 自动刷新重试 + 标准错误信封）。 */
  sendDanmaku?: (roomId: string, content: string) => Promise<unknown>;
}

export function createSseTransport(deps: SseTransportDeps = {}): StudyRoomTransport {
  let abort: AbortController | null = null;
  let onEvent: ((event: ServerEvent) => void) | null = null;
  let onStatus: ((status: TransportStatus) => void) | null = null;
  let roomId: string | null = null;

  let fetchImplPromise: Promise<FetchLike> | null = null;
  function resolveFetch(): Promise<FetchLike> {
    if (deps.fetchImpl !== undefined) return Promise.resolve(deps.fetchImpl);
    if (fetchImplPromise === null) {
      fetchImplPromise = import('expo/fetch').then((m) => m.fetch as unknown as FetchLike);
    }
    return fetchImplPromise;
  }

  /** 断开当前流 + 清回调（connect/close 共用；不触发 onStatus('closed')）。 */
  function teardown(): void {
    if (abort !== null) {
      abort.abort();
      abort = null;
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
      const controller = new AbortController();
      abort = controller;
      onStatus('connecting');

      const url = new URL(args.url);
      roomId = url.searchParams.get('room');

      void (async () => {
        try {
          const fetch = await resolveFetch();
          const response = await fetch(url.toString(), {
            headers: {
              accept: 'text/event-stream',
              ...(args.token ? { authorization: `Bearer ${args.token}` } : {}),
            },
            signal: controller.signal,
            cache: 'no-store',
          });
          if (!response.ok) {
            // 4xx/5xx（如会话过期重连前被 401）：交给 controller 退避重连
            onStatus?.('closed');
            return;
          }
          onStatus?.('open');

          const body = response.body;
          if (!body) {
            onStatus?.('closed');
            return;
          }

          const parser = createSseParser();
          const reader = body.getReader();
          const decoder = new TextDecoder();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            const text = decoder.decode(value, { stream: true });
            for (const payload of parser.push(text)) {
              const event = parseServerEvent(payload);
              if (event !== null) onEvent?.(event);
            }
          }
          for (const payload of parser.flush()) {
            const event = parseServerEvent(payload);
            if (event !== null) onEvent?.(event);
          }
          // 流自然结束（token 过期服务端关流等）：非主动取消才上报 closed → 重连
          if (!controller.signal.aborted) onStatus?.('closed');
        } catch (error) {
          // 自己主动 abort 结束（close()）：吞掉，不触发重连
          if (controller.signal.aborted) return;
          onStatus?.('closed');
        } finally {
          if (abort === controller) abort = null;
        }
      })();
    },

    send(event) {
      // SSE 无心跳/换房通道：heartbeat 概念取消，room.switch 由 controller
      // 从不下发（换房 = 重连新房间流）。
      if (event.type !== 'danmaku.send') return;
      if (roomId === null || onEvent === null) return;
      const room = roomId;
      const poster = deps.sendDanmaku ?? defaultSendDanmaku;
      void poster(room, event.content).catch((error: unknown) => {
        // HTTP error envelope → danmaku.rejected（复用控制器既有 reject 处理）
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