import { describe, expect, it, vi } from 'vitest';

import type { ClientEvent, ServerEvent } from '../domain/protocol';
import type { StudyRoomTransport, TransportStatus } from '../data/wsTransport';
import { createStudyRoomController } from './studyRoomController';

// 控制器行为守护（注入 fake transport，node 可测）：连接生命周期、
// snapshot/presence 收敛、发送队列与冷却、断线重连、leave 后不重连。

interface FakeTransport {
  transport: StudyRoomTransport;
  sent: ClientEvent[];
  connects: Array<{ url: string; token: string | null }>;
  emit(event: ServerEvent): void;
  status(status: TransportStatus): void;
}

function createFakeTransport(): FakeTransport {
  const sent: ClientEvent[] = [];
  const connects: Array<{ url: string; token: string | null }> = [];
  let onEvent: ((event: ServerEvent) => void) | null = null;
  let onStatus: ((status: TransportStatus) => void) | null = null;
  return {
    sent,
    connects,
    transport: {
      connect(args) {
        connects.push({ url: args.url, token: args.token });
        onEvent = args.onEvent;
        onStatus = args.onStatus;
      },
      send(event) {
        sent.push(event);
      },
      close() {
        onEvent = null;
        onStatus = null;
      },
    },
    emit(event) {
      onEvent?.(event);
    },
    status(status) {
      onStatus?.(status);
    },
  };
}

function snapshotEvent(overrides: Partial<Extract<ServerEvent, { type: 'snapshot' }>> = {}): ServerEvent {
  return {
    type: 'snapshot',
    roomId: 'rainy-study-room',
    onlineCount: 3,
    authed: true,
    messages: [
      {
        id: 7,
        roomId: 'rainy-study-room',
        userId: 'u1',
        nickname: '同学',
        content: '加油',
        createdAt: '2026-08-31T00:00:00.000Z',
      },
    ],
    rooms: [
      { roomId: 'rainy-study-room', onlineCount: 3 },
      { roomId: 'sunny-classroom', onlineCount: 1 },
    ],
    ...overrides,
  };
}

function createController(fake: FakeTransport) {
  return createStudyRoomController({
    transport: fake.transport,
    resolveUrl: () => 'ws://localhost:3321/studyroom',
    readToken: () => Promise.resolve('token-1'),
    now: () => 1_000_000,
  });
}

async function enterOpen(
  controller: ReturnType<typeof createController>,
  fake: FakeTransport,
  roomId: 'rainy-study-room' | 'sunny-classroom' | 'midnight-workstation' = 'rainy-study-room',
) {
  controller.actions.enter(roomId);
  await Promise.resolve(); // readToken 微任务
  fake.status('open');
}

describe('studyRoomController', () => {
  it('enters the requested room with resolved url + token and reaches open', async () => {
    const fake = createFakeTransport();
    const controller = createController(fake);
    controller.actions.enter('rainy-study-room');
    await Promise.resolve();
    expect(fake.connects).toEqual([
      { url: 'ws://localhost:3321/studyroom?room=rainy-study-room', token: 'token-1' },
    ]);
    expect(controller.getState().roomId).toBe('rainy-study-room');
    expect(controller.getState().status).toBe('connecting');
    fake.status('open');
    expect(controller.getState().status).toBe('open');
  });

  it('merges snapshot into state and replays history danmaku', async () => {
    const fake = createFakeTransport();
    const controller = createController(fake);
    const seen: Array<[number, string]> = [];
    controller.onDanmaku((message, origin) => seen.push([message.id, origin]));
    await enterOpen(controller, fake);
    fake.emit(snapshotEvent());
    expect(controller.getState().roomId).toBe('rainy-study-room');
    expect(controller.getState().onlineCount).toBe(3);
    expect(controller.getState().authed).toBe(true);
    expect(controller.getState().roomCounts).toHaveLength(2);
    expect(seen).toEqual([[7, 'history']]);
  });

  it('applies presence.update for the current room only, and presence.rooms always', async () => {
    const fake = createFakeTransport();
    const controller = createController(fake);
    await enterOpen(controller, fake);
    fake.emit(snapshotEvent());
    fake.emit({ type: 'presence.update', roomId: 'sunny-classroom', onlineCount: 99 });
    expect(controller.getState().onlineCount).toBe(3); // 他房变化不影响本房
    fake.emit({ type: 'presence.update', roomId: 'rainy-study-room', onlineCount: 5 });
    expect(controller.getState().onlineCount).toBe(5);
    fake.emit({
      type: 'presence.rooms',
      rooms: [{ roomId: 'rainy-study-room', onlineCount: 6 }],
    });
    expect(controller.getState().roomCounts[0]?.onlineCount).toBe(6);
  });

  it('sends danmaku while open and sets an optimistic cooldown', async () => {
    const fake = createFakeTransport();
    const controller = createController(fake);
    await enterOpen(controller, fake);
    controller.actions.send('你好');
    expect(fake.sent).toEqual([{ type: 'danmaku.send', content: '你好' }]);
    expect(controller.getState().sendCooldownUntil).toBe(1_003_000);
  });

  it('queues sends while connecting and flushes in order on open', async () => {
    const fake = createFakeTransport();
    const controller = createController(fake);
    controller.actions.enter('rainy-study-room');
    await Promise.resolve();
    controller.actions.send('一');
    controller.actions.send('二');
    expect(fake.sent).toEqual([]); // 未 open，先入队
    fake.status('open');
    expect(fake.sent.map((event) => event)).toEqual([
      { type: 'danmaku.send', content: '一' },
      { type: 'danmaku.send', content: '二' },
    ]);
  });

  it('records rejects and extends cooldown on cooldown rejects', async () => {
    const fake = createFakeTransport();
    const controller = createController(fake);
    await enterOpen(controller, fake);
    fake.emit({ type: 'danmaku.rejected', reason: 'cooldown', retryAfterSeconds: 2 });
    expect(controller.getState().lastReject?.reason).toBe('cooldown');
    expect(controller.getState().sendCooldownUntil).toBe(1_002_000);
    fake.emit({ type: 'danmaku.rejected', reason: 'blocked' });
    expect(controller.getState().lastReject?.reason).toBe('blocked');
  });

  it('reconnects into the same room after an unexpected close', async () => {
    vi.useFakeTimers();
    try {
      const fake = createFakeTransport();
      const controller = createController(fake);
      controller.actions.enter('midnight-workstation');
      await vi.runAllTimersAsync(); // readToken 微任务
      fake.status('open');
      fake.status('closed'); // 意外断开
      expect(controller.getState().status).toBe('reconnecting');
      await vi.advanceTimersByTimeAsync(1000); // 500ms 首次退避 + 抖动
      expect(fake.connects).toHaveLength(2);
      expect(fake.connects[1]?.url).toContain('room=midnight-workstation');
      fake.status('open');
      expect(controller.getState().status).toBe('open');
      // 第二次断开重连（attempts 已清零，退避从头算）
      fake.status('closed');
      await vi.advanceTimersByTimeAsync(1000);
      expect(fake.connects).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not reconnect after an explicit leave', async () => {
    vi.useFakeTimers();
    try {
      const fake = createFakeTransport();
      const controller = createController(fake);
      await enterOpen(controller, fake);
      controller.actions.leave();
      expect(controller.getState().status).toBe('idle');
      fake.status('closed'); // close() 之后的收尾事件
      await vi.advanceTimersByTimeAsync(30_000);
      expect(fake.connects).toHaveLength(1); // 未再连接
    } finally {
      vi.useRealTimers();
    }
  });
});
