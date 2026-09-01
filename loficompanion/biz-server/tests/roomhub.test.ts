import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

// roomHub 连接/广播/推进逻辑守护（原 WS 进程的连接层，现为进程内 hub）。
// 用 node:test mock timers 推进 setTimeout/Interval 与 Date.now，
// 假 StreamWriter 捕获 SSE 帧。每个 test 前 resetHubForTests() 隔离状态。

const { resetHubForTests, joinRoomStream, broadcastRoom, broadcastAll, allCounts, ensureHubMaintenance } =
  await import('../src/features/studyroom/server/roomHub.ts');
const { encodeServerEvent } = await import('../src/features/studyroom/server/protocol.ts');

function fakeWriter(frames: string[] = [], opts: { dead?: () => boolean } = {}) {
  let closed = false;
  return {
    frames,
    get writer() {
      return {
        write(frame: string): boolean {
          if (closed || opts.dead?.()) return false;
          frames.push(frame);
          return true;
        },
        get closed() {
          return closed;
        },
        close(): void {
          closed = true;
        },
      };
    },
    kill(): void {
      closed = true;
    },
  };
}

/** 把捕获到的 SSE data: 帧 JSON 化（过滤 : ping 注释帧）。 */
function events(frames: string[]): Array<Record<string, unknown> & { type: string }> {
  return frames
    .filter((frame) => frame.startsWith('data: '))
    .map((frame) => JSON.parse(frame.slice('data: '.length)));
}

test('join → presence debounce (2s) → presence.update + presence.rooms', () => {
  mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'] });
  try {
    const { writer, frames } = fakeWriter();
    resetHubForTests();

    const stream = joinRoomStream({ room: 'rainy-study-room', identity: null, expiresAtMs: null, writer });

    // join 计数立即可见（presence 广播经防抖，不在此刻透出）
    assert.deepEqual(allCounts().find((r) => r.roomId === 'rainy-study-room'), {
      roomId: 'rainy-study-room',
      onlineCount: 1,
    });

    mock.timers.tick(1999);
    assert.equal(events(frames).some((e) => e.type === 'presence.update'), false);
    mock.timers.tick(2);
    const fired = events(frames);
    assert.ok(fired.some((e) => e.type === 'presence.update' && e.onlineCount === 1));
    assert.ok(
      fired.some(
        (e) =>
          e.type === 'presence.rooms' &&
          (e.rooms as Array<{ onlineCount: number }>)[0]?.onlineCount === 1,
      ),
    );

    stream.leave();
    mock.timers.tick(2500);
  } finally {
    mock.timers.reset();
    resetHubForTests();
  }
});

test('broadcast reaches only same-room streams; others stay silent', () => {
  const a1 = fakeWriter();
  const a2 = fakeWriter();
  const b = fakeWriter();
  resetHubForTests();
  joinRoomStream({ room: 'rainy-study-room', identity: null, expiresAtMs: null, writer: a1.writer });
  joinRoomStream({ room: 'rainy-study-room', identity: null, expiresAtMs: null, writer: a2.writer });
  joinRoomStream({ room: 'sunny-classroom', identity: null, expiresAtMs: null, writer: b.writer });

  broadcastRoom('rainy-study-room', { type: 'danmaku.new', message: message(1) });

  assert.equal(events(a1.frames).length, 1);
  assert.equal(events(a2.frames).length, 1);
  assert.equal(events(b.frames).length, 0);

  broadcastAll({ type: 'presence.rooms', rooms: allCounts() });
  assert.equal(events(b.frames).filter((e) => e.type === 'presence.rooms').length, 1);
  resetHubForTests();
});

test('push failure (dead writer) auto-leaves and re-renders presence', () => {
  const dead = fakeWriter([], { dead: () => true });
  resetHubForTests();
  const stream = joinRoomStream({
    room: 'midnight-workstation',
    identity: null,
    expiresAtMs: null,
    writer: dead.writer,
  });
  assert.equal(allCounts()[2]?.onlineCount, 1);

  const ok = stream.push({ type: 'danmaku.new', message: message(2) });
  assert.equal(ok, false);
  assert.equal(allCounts()[2]?.onlineCount, 0); // 已自动 leave
  resetHubForTests();
});

test('expired guest stream closes immediately; future expiry closes after grace', () => {
  mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'] });
  try {
    resetHubForTests();

    // 已超过「过期 + 60s 宽限」：join 即收 error 事件 + writer.close + 不占用在线数
    const w1 = fakeWriter();
    const s1 = joinRoomStream({
      room: 'sunny-classroom',
      identity: null,
      expiresAtMs: Date.now() - 61_000,
      writer: w1.writer,
    });
    const fired1 = events(w1.frames);
    assert.equal(fired1.some((e) => e.type === 'error' && e.code === 'TOKEN_EXPIRED'), true);
    assert.equal(w1.writer.closed, true);
    assert.equal(
      allCounts().find((r) => r.roomId === 'sunny-classroom')?.onlineCount,
      0,
    );
    s1.leave();

    // 仍在有效期内的流：expiryTimer 到点（token 过期 + 宽限）才关流
    const w2 = fakeWriter();
    const s2 = joinRoomStream({
      room: 'sunny-classroom',
      identity: null,
      expiresAtMs: Date.now() + 5 * 60_000, // 5min 后过期（宽限期 60s 计入）
      writer: w2.writer,
    });
    assert.equal(
      allCounts().find((r) => r.roomId === 'sunny-classroom')?.onlineCount,
      1,
    );
    mock.timers.tick(6 * 60_000 + 10_000);
    assert.equal(w2.writer.closed, true);
    assert.ok(events(w2.frames).some((e) => e.type === 'error' && e.code === 'TOKEN_EXPIRED'));
    s2.leave();
  } finally {
    mock.timers.reset();
    resetHubForTests();
  }
});

test('maintenance: : ping keeps healthy silent stream alive; dead writer evicted on first sweep', () => {
  mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'] });
  try {
    const healthy = fakeWriter();
    resetHubForTests();
    joinRoomStream({ room: 'rainy-study-room', identity: null, expiresAtMs: null, writer: healthy.writer });
    // 死 writer：write 恒 false（对应 socket 已死、enqueue 抛）→ 首个维护周期即 leave
    const dead = fakeWriter([], { dead: () => true });
    joinRoomStream({ room: 'sunny-classroom', identity: null, expiresAtMs: null, writer: dead.writer });

    ensureHubMaintenance(15_000);
    mock.timers.tick(15_000);
    assert.equal(allCounts()[1]?.onlineCount, 0);
    // 健康流：ping 成功刷新 lastWriteAtMs，静默期也不被清
    mock.timers.tick(90_000); // 远超 STALE_AFTER_MS，仍在线
    assert.equal(allCounts()[0]?.onlineCount, 1);
    assert.ok(healthy.frames.some((f) => f.startsWith(': ping')));
  } finally {
    mock.timers.reset();
    resetHubForTests();
  }
});

test('sse framing is data: <json>\\n\\n (SNR 兼容，RN parseServerEvent 原样可用)', () => {
  const { writer, frames } = fakeWriter();
  resetHubForTests();
  const stream = joinRoomStream({ room: 'rainy-study-room', identity: null, expiresAtMs: null, writer });

  const event = { type: 'presence.update' as const, roomId: 'rainy-study-room' as const, onlineCount: 3 };
  stream.push(event);
  assert.equal(frames[0] ?? '', `data: ${encodeServerEvent(event)}\n\n`);
  resetHubForTests();
});

function message(id: number) {
  return {
    id,
    roomId: 'rainy-study-room',
    userId: 'u1',
    nickname: '同学',
    content: '加油',
    createdAt: '2026-08-31T00:00:00.000Z',
  } as const;
}