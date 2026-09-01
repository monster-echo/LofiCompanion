import { describe, expect, it, vi } from 'vitest';

import { ApiClientError } from '../../../data/apiClient';
import {
  createSseTransport,
  type SseSourceLike,
  type SseTransportDeps,
} from './sseTransport';
import type { StudyRoomTransport, TransportStatus } from './sseTransport';
import type { ServerEvent } from '../domain/protocol';

// SSE 传输层守护（注入假事件源 + 假 POST poster）：生命周期、鉴权头、
// 事件透传、error→重连交还 closed、reject 映射、主动关闭不触发重连。

type OpenedSource = SseSourceLike & {
  emit(event: { type: string; [field: string]: unknown }): void;
  closedCount: number;
};

function useSourceFactory(calls: Array<{ url: string; token: string | null }> = []) {
  let opened: OpenedSource | null = null;
  function factory(url: string, token: string | null) {
    calls.push({ url, token });
    const listeners = new Map<string, Array<(event: { type: string; data?: string | null }) => void>>();
    const source = {
      closedCount: 0,
      addEventListener(type: string, listener: (event: { type: string; data?: string | null }) => void) {
        const set = listeners.get(type) ?? [];
        set.push(listener);
        listeners.set(type, set);
      },
      close() {
        this.closedCount += 1;
      },
      emit(event: { type: string; [field: string]: unknown }) {
        for (const listener of listeners.get(event.type) ?? []) listener(event as { type: string; data?: string | null });
      },
    };
    opened = source;
    return source;
  }
  return { factory, opened: () => opened, calls };
}

function openTransport(deps: Partial<SseTransportDeps>) {
  const transport = createSseTransport(deps);
  const statuses: Array<'connecting' | 'open' | 'closed'> = [];
  const received: ServerEvent[] = [];
  return {
    transport,
    statuses,
    received,
    connect(url: string, token: string | null = null) {
      transport.connect({
        url,
        token,
        onEvent: (event) => received.push(event),
        onStatus: (status) => statuses.push(status),
      });
    },
  };
}

// 取 SseSourceLike 工厂的窄签名（field 顺序与 real 一致）
type PathTo<T> = T;

async function flush() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('createSseTransport', () => {
  it('opens the stream, forwards parsed message events, closes at stream end', async () => {
    const { factory, opened, calls } = useSourceFactory();
    const harness = openTransport({ createSource: factory });
    harness.connect('http://localhost:3320/api/studyroom/stream?room=rainy-study-room', 'token-1');
    await flush();

    expect(calls).toEqual([
      { url: 'http://localhost:3320/api/studyroom/stream?room=rainy-study-room', token: 'token-1' },
    ]);
    opened()?.emit({ type: 'open' });
    await flush();
    expect(harness.statuses[0]).toBe('connecting');
    expect(harness.statuses).toContain('open');

    opened()?.emit({
      type: 'message',
      data: '{"type":"presence.update","roomId":"rainy-study-room","onlineCount":3}',
    });
    opened()?.emit({ type: 'message', data: 'not-json' }); // 垃圾帧忽略不打断
    opened()?.emit({ type: 'message', data: '{"type":"presence.rooms","rooms":[]}' });
    await flush();

    expect(harness.received.some((e) => e.type === 'presence.update')).toBe(true);
    expect(harness.received.some((e) => e.type === 'presence.rooms')).toBe(true);

    opened()?.emit({ type: 'close' });
    await flush();
    expect(harness.statuses.at(-1)).toBe('closed');
  });

  it('closes the source and reports closed on error (kills internal auto-reconnect)', async () => {
    const { factory, opened } = useSourceFactory();
    const harness = openTransport({ createSource: factory });
    harness.connect('http://localhost:3320/api/studyroom/stream?room=sunny-classroom');
    await flush();
    opened()?.emit({ type: 'open' });
    await flush();
    expect(harness.statuses).toContain('open');

    opened()?.emit({ type: 'error', message: 'network down', xhrStatus: 0 });
    await flush();
    expect(harness.statuses.at(-1)).toBe('closed');
    expect(opened()?.closedCount).toBe(1); // 内部重连被掐断，只 close 一次
  });

  it('passes no token for guests and connects regardless', async () => {
    const { factory, calls } = useSourceFactory();
    const harness = openTransport({ createSource: factory });
    harness.connect('http://localhost:3320/api/studyroom/stream?room=sunny-classroom');
    await flush();
    expect(calls[0]?.token).toBeNull();
    harness.transport.close();
  });

  it('posts danmaku via injected poster and maps HTTP errors to danmaku.rejected', async () => {
    const poster = vi.fn(async () => {
      throw new ApiClientError('COOLDOWN', '发送太频繁', 429, false, 3);
    });
    const { factory, opened } = useSourceFactory();
    const harness = openTransport({ createSource: factory, sendDanmaku: poster });
    harness.connect('http://localhost:3320/api/studyroom/stream?room=rainy-study-room', 't');
    await flush();
    opened()?.emit({ type: 'open' });
    await flush();

    const transport = harness.transport as StudyRoomTransport;
    transport.send({ type: 'danmaku.send', content: '你好' });
    await flush();

    expect(poster).toHaveBeenCalledWith('rainy-study-room', '你好');
    expect(harness.received).toEqual([
      { type: 'danmaku.rejected', reason: 'cooldown', retryAfterSeconds: 3 },
    ]);
  });

  it('ignores non-send events and does not emit closed after explicit user close', async () => {
    const { factory, opened } = useSourceFactory();
    const harness = openTransport({ createSource: factory });
    harness.connect('http://localhost:3320/api/studyroom/stream?room=rainy-study-room', 't');
    await flush();
    opened()?.emit({ type: 'open' });
    await flush();

    const transport = harness.transport as StudyRoomTransport;
    transport.send({ type: 'heartbeat' }); // 无 SSE 通道：忽略
    transport.close();
    expect(opened()?.closedCount).toBe(1);

    const before = harness.statuses.length;
    opened()?.emit({ type: 'error' });
    opened()?.emit({ type: 'close' });
    await flush();
    expect(harness.statuses.length).toBe(before); // 用户 close 后不再追加 closed
  });
});