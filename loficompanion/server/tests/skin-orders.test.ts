import assert from 'node:assert/strict';
import test, { after } from 'node:test';
type ApiError = { status: number; code: string };

// ALL imports at the top, before any test() — avoids node:test firing after() early.
const { database } = await import('../src/server/database.ts');
const { defaultConfig } = await import('../src/domain/config.ts');
const { createSkinOrder, verifySkinOrder, getSkinOrder } = await import('../src/features/skins/data/order-service.ts');
const { verifyPurchase } = await import('../src/server/order-service.ts');
const { listActiveEntitlements } = await import('../src/server/entitlement-service.ts');
const { findOrderById } = await import('../src/server/order-repository.ts');
const { applyWebhook } = await import('../src/server/webhook-service.ts');
const { getCurrentManifest } = await import('../src/features/skins/data/skin-repository.ts');

after(async () => database.close());

// 夹具幂等清理（模式同 payment.test.ts）：webhook 事件按固定前缀清理，
// 订单/权益随随机用户隔离，本地持久库重跑不冲突。
{
  await database.prepare(
    "DELETE FROM webhook_events WHERE provider = 'mock' AND event_id LIKE 'sko-refund-%'",
  ).run();
  await database.prepare(
    "UPDATE skin_products SET status = 'active' WHERE id = 'skin-product-sunny-classroom'",
  ).run();
}

const REFUND_EVENT_ID = `sko-refund-${process.pid}`;

async function makeUser(appId: string): Promise<string> {
  const id = `u-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  const ts = new Date().toISOString();
  await database.prepare(
    `INSERT INTO users(id, app_id, email, password_hash, username, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, appId, `t-${id}@test.local`, 'hash', id, ts, ts);
  return id;
}

async function activeEntitlementCount(userId: string, key: string): Promise<number> {
  const row = await database.prepare(
    `SELECT COUNT(*)::int AS n FROM user_entitlements
     WHERE user_id = ? AND entitlement_key = ? AND active = 1`,
  ).get(userId, key) as { n: number };
  return row.n;
}

// 走模板 verifyPurchase（skin_orders 绑定 → 委托皮肤订单验证）。
async function verifyViaTemplate(
  userId: string, orderId: string, receipt: unknown = {},
) {
  return await verifyPurchase({
    appId: 'app1', environment: 'development', userId, orderId,
    receipt, platform: 'ios', config: defaultConfig,
  });
}

test('下单幂等：同 Idempotency-Key 同单，pending + 目录价格/权益键', async () => {
  const userId = await makeUser('app1');
  const a = await createSkinOrder({ userId, skinId: 'sunny-classroom', idempotencyKey: 'sko-key-1' });
  const b = await createSkinOrder({ userId, skinId: 'skin-sunny-classroom', idempotencyKey: 'sko-key-1' });
  assert.equal(a.status, 'pending');
  assert.equal(a.orderId, b.orderId);
  assert.equal(a.slug, 'sunny-classroom');
  assert.equal(a.priceMinor, 1200);
  assert.equal(a.currency, 'CNY');
  assert.equal(a.entitlementKey, 'skin.official.sunny-classroom');
  assert.equal(a.entitled, false);
});

test('不可下单：未知皮肤/免费皮肤 404，下架商品 422', async () => {
  const userId = await makeUser('app1');
  await assert.rejects(
    () => createSkinOrder({ userId, skinId: 'skin-nope', idempotencyKey: 'k-nope' }),
    (err: ApiError) => err.status === 404 && err.code === 'SKIN_NOT_FOUND',
  );
  await assert.rejects(
    () => createSkinOrder({ userId, skinId: 'rainy-study-room', idempotencyKey: 'k-free' }),
    (err: ApiError) => err.status === 404 && err.code === 'SKIN_PRODUCT_NOT_FOUND',
  );
  try {
    await database.prepare(
      "UPDATE skin_products SET status = 'inactive' WHERE id = 'skin-product-sunny-classroom'",
    ).run();
    await assert.rejects(
      () => createSkinOrder({ userId, skinId: 'sunny-classroom', idempotencyKey: 'k-off' }),
      (err: ApiError) => err.status === 422 && err.code === 'SKIN_PRODUCT_INACTIVE',
    );
  } finally {
    await database.prepare(
      "UPDATE skin_products SET status = 'active' WHERE id = 'skin-product-sunny-classroom'",
    ).run();
  }
});

test('verify（模板 /purchases/verify 委托路径）→ success + 权益 + 付费 manifest 200', async () => {
  const userId = await makeUser('app1');
  const order = await createSkinOrder({ userId, skinId: 'sunny-classroom', idempotencyKey: `sko-v-${userId}` });
  const done = await verifyViaTemplate(userId, order.orderId);
  assert.equal(done.status, 'success');
  assert.equal(await activeEntitlementCount(userId, 'skin.official.sunny-classroom'), 1);

  const envelope = await getCurrentManifest('sunny-classroom', userId);
  assert.equal(envelope.slug, 'sunny-classroom');
});

test('同一订单 verify 重放 10 次 → 权益只发放一次', async () => {
  const userId = await makeUser('app1');
  const order = await createSkinOrder({ userId, skinId: 'sunny-classroom', idempotencyKey: `sko-r-${userId}` });
  for (let i = 0; i < 10; i++) {
    const done = await verifySkinOrder({
      appId: 'app1', environment: 'development', userId, orderId: order.orderId, receipt: {},
    });
    assert.equal(done.status, 'success');
  }
  assert.equal(await activeEntitlementCount(userId, 'skin.official.sunny-classroom'), 1);
});

test('退款 webhook 重放 10 次 → 撤销一次，manifest 翻回 403', async () => {
  const userId = await makeUser('app1');
  const order = await createSkinOrder({ userId, skinId: 'sunny-classroom', idempotencyKey: `sko-f-${userId}` });
  await verifyViaTemplate(userId, order.orderId);
  assert.ok(await getCurrentManifest('sunny-classroom', userId));

  const body = Buffer.from(JSON.stringify({
    eventId: REFUND_EVENT_ID, kind: 'refund', orderId: order.orderId,
  }));
  let deduped = 0;
  for (let i = 0; i < 10; i++) {
    const result = await applyWebhook('mock', body, {});
    if (result.deduplicated) deduped += 1;
  }
  assert.equal(deduped, 9, '首次 applied，其余 9 次去重');
  const stored = await findOrderById(order.orderId);
  assert.equal(stored!.status, 'refunded');
  assert.equal(await activeEntitlementCount(userId, 'skin.official.sunny-classroom'), 0);
  await assert.rejects(
    () => getCurrentManifest('sunny-classroom', userId),
    (err: ApiError) => err.status === 403 && err.code === 'SKIN_NOT_ENTITLED',
  );
});

test('恢复购买：皮肤权益键出现在 active entitlements（restore 端点数据源）', async () => {
  const userId = await makeUser('app1');
  const order = await createSkinOrder({ userId, skinId: 'sunny-classroom', idempotencyKey: `sko-restore-${userId}` });
  await verifyViaTemplate(userId, order.orderId);
  const keys = (await listActiveEntitlements(userId, 'app1')).map((e) => e.entitlement_key);
  assert.ok(keys.includes('skin.official.sunny-classroom'));
});

test('中断恢复：pending 查单 → verify → success + entitled=true', async () => {
  const userId = await makeUser('app1');
  const created = await createSkinOrder({ userId, skinId: 'sunny-classroom', idempotencyKey: `sko-i-${userId}` });
  const pending = await getSkinOrder({ userId, orderId: created.orderId });
  assert.equal(pending.status, 'pending');
  assert.equal(pending.entitled, false);

  await verifyViaTemplate(userId, created.orderId);
  const done = await getSkinOrder({ userId, orderId: created.orderId });
  assert.equal(done.status, 'success');
  assert.equal(done.entitled, true);
  assert.ok(done.completedAt);
});

test('跨用户查单/验证一律 404 ORDER_NOT_FOUND', async () => {
  const owner = await makeUser('app1');
  const attacker = await makeUser('app1');
  const order = await createSkinOrder({ userId: owner, skinId: 'sunny-classroom', idempotencyKey: `sko-x-${owner}` });
  await assert.rejects(
    () => getSkinOrder({ userId: attacker, orderId: order.orderId }),
    (err: ApiError) => err.status === 404 && err.code === 'ORDER_NOT_FOUND',
  );
  await assert.rejects(
    () => verifySkinOrder({
      appId: 'app1', environment: 'development', userId: attacker,
      orderId: order.orderId, receipt: {},
    }),
    (err: ApiError) => err.status === 404 && err.code === 'ORDER_NOT_FOUND',
  );
  assert.equal(await activeEntitlementCount(attacker, 'skin.official.sunny-classroom'), 0);
});

test('verify 失败：订单 failed、不发权益、manifest 仍 403', async () => {
  const userId = await makeUser('app1');
  const order = await createSkinOrder({ userId, skinId: 'sunny-classroom', idempotencyKey: `sko-bad-${userId}` });
  const done = await verifySkinOrder({
    appId: 'app1', environment: 'development', userId, orderId: order.orderId,
    receipt: { fail: true },
  });
  assert.equal(done.status, 'failed');
  assert.equal(await activeEntitlementCount(userId, 'skin.official.sunny-classroom'), 0);
  await assert.rejects(
    () => getCurrentManifest('sunny-classroom', userId),
    (err: ApiError) => err.status === 403,
  );
});
