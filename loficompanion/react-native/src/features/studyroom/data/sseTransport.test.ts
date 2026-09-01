import { describe, expect, it, vi } from 'vitest';

import { ApiClientError } from '../../../data/apiClient';
import { createSseTransport, type StudyRoomTransport } from './sseTransport';
import type { ServerEvent } from '../domain/protocol';

// SSE 传输层守护（注入假 fetch stream + 假 POST poster）：生命周期、
// 鉴权头、事件透传、reject 映射、主动关闭不触发重连。

interface StreamResponseLike {
  ok: boolean;
  status: number;
  body: ReadableStream<Uint8Array> | null;
  headers?: Record<string, string>;
}

type FetchCall = {
  url: string;
  init: { headers?: Record<string, string>; signal?: AbortSignal; cache?: string };
};

function sseResponse(chunks: Array<string | Uint8Array>, status = 200): StreamResponseLike {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk);
      }
      controller.close();
    },
  });
  return { ok: status >= 200 && status < 300, status, body };
}

function openTransport(
  fetchImpl: (url: string, init: FetchCall['init']) => Promise<StreamResponseLike>,
  sendDanmaku?: (roomId: string, content: string) => Promise<unknown>,
) {
  const transport = createSseTransport({
    fetchImpl: fetchImpl as never,
    ...(sendDanmaku ? { sendDanmaku } : {}),
  });
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

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setImmediate(resolve));
  await Promise.resolve();
}

describe('createSseTransport', () => {
  it('opens the stream, forwards parsed events across chunk boundaries, closes at stream end', async () => {
    const calls: FetchCall[] = [];
    const harness = openTransport(async (url, init) => {
      calls.push({ url, init });
      // 帧故意跨字节块拆分（含完整 data 字段劈两半）；另插一帧解析垃圾
      // 验证「忽略坏帧、不打断后续帧」。
      return sseResponse([
        ': ok\n\n',
        'data: {"type":"presence.update","roomId":"rainy-study-room","onlineCount":3}\n\n',
        'data: {"type":"presence.roo',
        'ms","rooms":[]}\n\n',
        'data: not-json\n\n',
        'data: {"type":"danmaku.new"}\n\n',
      ]);
    });

    harness.connect('http://localhost:3320/api/studyroom/stream?room=rainy-study-room', 'token-1');
    await flush();

    expect(statusOf(harness.statuses)).toBe('open');
    expect(harness.statuses[0]).toBe('connecting');
    expect(harness.statuses).toContain('open');
    expect(harness.statuses.at(-1)).toBe('closed');
    expect(harness.received.some((e) => e.type === 'presence.update')).toBe(true);
    expect(harness.received.some((e) => e.type === 'presence.rooms')).toBe(true);
    expect(calls.length).toBe(1);
    expect(calls[0]?.url).toContain('room=rainy-study-room');
    expect(calls[0]?.init.headers?.authorization).toBe('Bearer token-1');
  });

  it('sends no auth header for guests', async () => {
    const calls: FetchCall[] = [];
    const harness = openTransport(async (url, init) => {
      calls.push({ url, init });
      return sseResponse(['data: {"type":"presence.rooms","rooms":[]}\n\n']);
    });
    harness.connect('http://localhost:3320/api/studyroom/stream?room=sunny-classroom');
    await flush();
    expect(calls[0]?.init.headers?.authorization).toBeUndefined();
  });

  it('surfaces non-2xx as closed without open', async () => {
    const harness = openTransport(async () => sseResponse([], 401));
    harness.connect('http://localhost:3320/api/studyroom/stream?room=rainy-study-room');
    await flush();
    expect(harness.statuses).toEqual(['connecting', 'closed']);
  });

  it('posts danmaku via injected poster and maps HTTP errors to danmaku.rejected', async () => {
    const poster = vi.fn(async () => {
      throw new ApiClientError('COOLDOWN', '发送太频繁', 429, false, 3);
    });
    const harness = openTransport(async () => sseResponse([]), poster);
    harness.connect('http://localhost:3320/api/studyroom/stream?room=rainy-study-room', 't');
    await flush();

    const transport = harness.transport as StudyRoomTransport;
    transport.send({ type: 'danmaku.send', content: '你好' });
    await flush();

    expect(poster).toHaveBeenCalledWith('rainy-study-room', '你好');
    expect(harness.received).toEqual([
      { type: 'danmaku.rejected', reason: 'cooldown', retryAfterSeconds: 3 },
    ]);
  });

  it('ignores non-send events and swallows failures when user closed', async () => {
    // 属性壳避免 TS 对闭包赋值的收窄判定
    const captured: { signal: AbortSignal | null } = { signal: null };
    // 悬挂流：不发数据也不结束，交给 abort 信号打断——模拟读流中被 close()
    const harness = openTransport(async (_url: string, init: FetchCall['init']) => {
      captured.signal = init.signal ?? null;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          init.signal?.addEventListener(
            'abort',
            () => controller.error(new Error('aborted')),
            { once: true },
          );
        },
      });
      return Promise.resolve({ ok: true, status: 200, body });
    });
    harness.connect('http://localhost:3320/api/studyroom/stream?room=rainy-study-room', 't');
    await flush();
    expect(harness.statuses).toContain('open');

    const transport = harness.transport as StudyRoomTransport;
    transport.send({ type: 'heartbeat' }); // 无 SSE 通道：忽略
    transport.close();
    expect(captured.signal?.aborted).toBe(true);
    await flush();
    // 主动 close：不再追加 closed 状态（重连交给 leave 语义，不在此层触发）
    expect(harness.statuses.includes('closed')).toBe(false);
  });
});

function statusOf(statuses: Array<'connecting' | 'open' | 'closed'>): 'open' | 'close' {
  return statuses.includes('open') ? 'open' : 'close';
}