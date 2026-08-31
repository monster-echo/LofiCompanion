import assert from 'node:assert/strict';
import { test } from 'node:test';

// 自习室纯逻辑守护：内容校验码点口径、黑名单归一化、冷却闸假时钟、
// 线协议解析对垃圾输入的容错。WS 连接/广播逻辑不在纯域内，由 wscat 冒烟覆盖。

const { validateDanmakuContent, DANMAKU_MAX_CHARS } = await import(
  '../src/features/studyroom/server/validate.ts'
);
const { matchesBlocklist } = await import('../src/features/studyroom/server/blocklist.ts');
const { CooldownGate } = await import('../src/features/studyroom/server/cooldown.ts');
const { parseClientEvent, encodeServerEvent } = await import(
  '../src/features/studyroom/server/protocol.ts'
);
const { isStudyRoomId } = await import('../src/features/studyroom/domain/rooms.ts');

test('validateDanmakuContent counts Unicode code points, trims edges', () => {
  assert.deepEqual(validateDanmakuContent('  大家一起加油  '), { ok: true, content: '大家一起加油' });
  // 42 码点（含 1 个扩展平面 emoji）恰好通过
  const limit = '一'.repeat(41) + '🎓';
  assert.equal([...limit].length, 42);
  assert.equal(validateDanmakuContent(limit).ok, true);
  // 43 码点拒绝
  const over = limit + '!';
  assert.deepEqual(validateDanmakuContent(over), { ok: false, reason: 'too_long' });
  assert.equal(DANMAKU_MAX_CHARS, 42);
});

test('validateDanmakuContent rejects empty and non-string', () => {
  assert.deepEqual(validateDanmakuContent('   '), { ok: false, reason: 'empty' });
  assert.deepEqual(validateDanmakuContent(''), { ok: false, reason: 'empty' });
  assert.deepEqual(validateDanmakuContent(42), { ok: false, reason: 'invalid' });
  assert.deepEqual(validateDanmakuContent(null), { ok: false, reason: 'invalid' });
});

test('matchesBlocklist normalizes case and whitespace before matching', () => {
  assert.equal(matchesBlocklist('加微信领福利'), true);
  assert.equal(matchesBlocklist('加 微 信'), true);
  assert.equal(matchesBlocklist('HORNY'), true);
  assert.equal(matchesBlocklist('今天也在努力'), false);
  assert.equal(matchesBlocklist('   '), false);
});

test('CooldownGate enforces window per key with injected clock', () => {
  let nowMs = 1_000_000;
  const gate = new CooldownGate(() => nowMs, 3000);
  assert.deepEqual(gate.tryAcquire('user-a'), { ok: true });
  const rejected = gate.tryAcquire('user-a');
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.equal(rejected.retryAfterSeconds, 3);
  nowMs += 2_000;
  assert.equal(gate.tryAcquire('user-a').ok, false);
  nowMs += 1_001; // 越过 3s 窗口
  assert.deepEqual(gate.tryAcquire('user-a'), { ok: true });
  // 不同 key 互不影响
  assert.deepEqual(gate.tryAcquire('user-b'), { ok: true });
});

test('parseClientEvent never throws and whitelists shapes', () => {
  assert.equal(parseClientEvent('not json'), null);
  assert.equal(parseClientEvent('[]'), null);
  assert.equal(parseClientEvent('null'), null);
  assert.equal(parseClientEvent('{"type":"mystery"}'), null);
  assert.equal(parseClientEvent('{"type":"danmaku.send"}'), null); // 缺 content
  assert.equal(parseClientEvent('{"type":"danmaku.send","content":1}'), null);
  assert.equal(parseClientEvent('{"type":"room.switch","roomId":"nope"}'), null);
  assert.deepEqual(parseClientEvent('{"type":"heartbeat"}'), { type: 'heartbeat' });
  assert.deepEqual(parseClientEvent('{"type":"danmaku.send","content":"hi"}'), {
    type: 'danmaku.send',
    content: 'hi',
  });
  assert.deepEqual(parseClientEvent('{"type":"room.switch","roomId":"sunny-classroom"}'), {
    type: 'room.switch',
    roomId: 'sunny-classroom',
  });
});

test('encodeServerEvent round-trips plain JSON payloads', () => {
  const encoded = encodeServerEvent({
    type: 'danmaku.new',
    message: {
      id: 7,
      roomId: 'rainy-study-room',
      userId: 'u1',
      nickname: '同学',
      content: '加油',
      createdAt: '2026-08-31T00:00:00.000Z',
    },
  });
  assert.deepEqual(JSON.parse(encoded), {
    type: 'danmaku.new',
    message: {
      id: 7,
      roomId: 'rainy-study-room',
      userId: 'u1',
      nickname: '同学',
      content: '加油',
      createdAt: '2026-08-31T00:00:00.000Z',
    },
  });
});

test('isStudyRoomId whitelists exactly the three built-in rooms', () => {
  for (const id of ['rainy-study-room', 'sunny-classroom', 'midnight-workstation']) {
    assert.equal(isStudyRoomId(id), true);
  }
  assert.equal(isStudyRoomId('room'), false);
  assert.equal(isStudyRoomId(''), false);
  assert.equal(isStudyRoomId(42), false);
  assert.equal(isStudyRoomId(null), false);
});
