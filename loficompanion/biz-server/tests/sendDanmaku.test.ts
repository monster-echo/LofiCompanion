import assert from 'node:assert/strict';
import { test } from 'node:test';

// 弹幕发送管道守护：校验→黑名单→冷却→落库→广播的顺序与错误码线格式
// （POST /api/studyroom/danmaku 的纯逻辑；鉴权由路由 requireIdentity 前置覆盖）。

const { sendDanmaku } = await import('../src/features/studyroom/server/sendDanmaku.ts');
const { CooldownGate } = await import('../src/features/studyroom/server/cooldown.ts');
const { ApiError } = await import('../src/lib/apiError.ts');
import type { SendDanmakuDeps } from '../src/features/studyroom/server/sendDanmaku';

const identity = { userId: 'user-1', appId: 'loficompanion', sessionId: 's1' } as const;

function fakeDeps(overrides: Partial<SendDanmakuDeps> = {}): SendDanmakuDeps {
  return {
    cooldown: overrides.cooldown ?? new CooldownGate(Date.now, 3000),
    broadcast: overrides.broadcast ?? (() => {}),
    insert: overrides.insert ?? (async () => 42),
    resolve:
      overrides.resolve ??
      (async (ids: readonly string[]) =>
        new Map(ids.map((id) => [id, { nickname: '同学', avatarUrl: null }]))) as SendDanmakuDeps['resolve'],
  };
}

test('blocklist hit → BLOCKED ApiError(403), no broadcast/insert', async () => {
  let inserted = false;
  let broadcasted = false;
  await assert.rejects(
    sendDanmaku(
      { roomId: 'rainy-study-room', identity, contentRaw: '加微信领福利' },
      fakeDeps({
        insert: async () => {
          inserted = true;
          return 1;
        },
        broadcast: () => {
          broadcasted = true;
        },
      }),
    ),
    (error) =>
      error instanceof ApiError && error.code === 'BLOCKED' && error.status === 403,
  );
  assert.equal(inserted, false);
  assert.equal(broadcasted, false);
});

test('too_long → TOO_LONG ApiError(400)', async () => {
  await assert.rejects(
    sendDanmaku({ roomId: 'rainy-study-room', identity, contentRaw: '一'.repeat(50) }),
    (error) => error instanceof ApiError && error.code === 'TOO_LONG',
  );
});

test('cooldown within window → COOLDOWN(429) with retryAfterSeconds', async () => {
  let nowMs = 1_000_000;
  const gate = new CooldownGate(() => nowMs, 3000);
  gate.tryAcquire(identity.userId); // 占位
  await assert.rejects(
    sendDanmaku(
      { roomId: 'rainy-study-room', identity, contentRaw: '又一条' },
      fakeDeps({ cooldown: gate }),
    ),
    (error) =>
      error instanceof ApiError &&
      error.code === 'COOLDOWN' &&
      error.status === 429 &&
      error.retryAfterSeconds === 3,
  );
});

test('success path: insert → 昵称解析 → broadcast danmaku.new → returns message', async () => {
  const broadcasts: unknown[] = [];
  const message = await sendDanmaku(
    { roomId: 'rainy-study-room', identity, contentRaw: '今晚也一起加油' },
    fakeDeps({
      insert: async () => 7,
      resolve: async () => new Map([['user-1', { nickname: '小台灯', avatarUrl: null }]]),
      broadcast: (_roomId: unknown, event: unknown) => broadcasts.push(event),
    }),
  );
  assert.equal(message.id, 7);
  assert.equal(message.nickname, '小台灯');
  assert.equal(message.content, '今晚也一起加油');
  assert.equal(broadcasts.length, 1);

  const event = broadcasts[0] as { type: string; message: typeof message };
  assert.equal(event.type, 'danmaku.new');
  assert.equal(event.message.id, 7);
  assert.equal(event.message.roomId, 'rainy-study-room');
});

test('profile service flake → falls back to FALLBACK_NICKNAME, still broadcasts', async () => {
  const broadcasts: unknown[] = [];
  const message = await sendDanmaku(
    { roomId: 'sunny-classroom', identity, contentRaw: '加油' },
    fakeDeps({
      resolve: async () => {
        throw new Error('auth down');
      },
      broadcast: (_roomId: unknown, event: unknown) => broadcasts.push(event),
    }),
  );
  assert.equal(message.nickname, '同学');
  assert.equal(broadcasts.length, 1);
});

test('persist failure → STORAGE_UNAVAILABLE(503, retryable)', async () => {
  await assert.rejects(
    sendDanmaku(
      { roomId: 'rainy-study-room', identity, contentRaw: '这条会失败' },
      fakeDeps({
        insert: async () => {
          throw new Error('db down');
        },
      }),
    ),
    (error) =>
      error instanceof ApiError &&
      error.code === 'STORAGE_UNAVAILABLE' &&
      error.status === 503 &&
      error.retryable === true,
  );
});