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
    "UPDATE skin_products SET status = 'active' WHERE id = 'skin-product-paid-fixture'",
  ).run();
}

// 合成付费皮肤夹具：种子皮肤已全免费（doc-01 PRD），订单/权益门禁管线
// （docs/05，付费能力保留）的覆盖改走这套夹具，待未来真实收费皮肤接入。
{
  const ts = new Date().toISOString();
  await database.prepare(
    `INSERT INTO skins(id, slug, name, access_type, manifest_version, moderation_status, published_at, created_at)
     VALUES ('skin-paid-fixture', 'paid-fixture', '付费测试皮肤', 'paid', 1, 'approved', ?, ?)
     ON CONFLICT (id) DO NOTHING`,
  ).run(ts, ts);
  await database.prepare(
    `INSERT INTO skin_manifests(id, skin_id, version, manifest, created_at)
     VALUES ('skin-manifest-paid-fixture-1', 'skin-paid-fixture', 1, ?, ?)
     ON CONFLICT (skin_id, version) DO NOTHING`,
  ).run(JSON.stringify({ id: 'paid-fixture-v1', slug: 'paid-fixture', states: [], eventMappings: [] }), ts);
  await database.prepare(
    `INSERT INTO skin_products(id, skin_id, entitlement_key, store_product_ids, price_minor, currency, status, created_at, updated_at)
     VALUES ('skin-product-paid-fixture', 'skin-paid-fixture', 'skin.official.paid-fixture', '{}', 1200, 'CNY', 'active', ?, ?)
     ON CONFLICT (id) DO NOTHING`,
  ).run(ts, ts);
  // 免费皮肤夹具：skin 行存在但无 product 行（「皮肤在册但不可下单」用例）
  await database.prepare(
    `INSERT INTO skins(id, slug, name, access_type, manifest_version, moderation_status, published_at, created_at)
     VALUES ('skin-free-fixture', 'free-fixture', '免费测试皮肤', 'free', 1, 'approved', ?, ?)
     ON CONFLICT (id) DO NOTHING`,
  ).run(ts, ts);
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
  const a = await createSkinOrder({ userId, skinId: 'paid-fixture', idempotencyKey: 'sko-key-1' });
  const b = await createSkinOrder({ userId, skinId: 'skin-paid-fixture', idempotencyKey: 'sko-key-1' });
  assert.equal(a.status, 'pending');
  assert.equal(a.orderId, b.orderId);
  assert.equal(a.slug, 'paid-fixture');
  assert.equal(a.priceMinor, 1200);
  assert.equal(a.currency, 'CNY');
  assert.equal(a.entitlementKey, 'skin.official.paid-fixture');
  assert.equal(a.entitled, false);
});

test('不可下单：未知皮肤/免费皮肤 404，下架商品 422', async () => {
  const userId = await makeUser('app1');
  await assert.rejects(
    () => createSkinOrder({ userId, skinId: 'skin-nope', idempotencyKey: 'k-nope' }),
    (err: ApiError) => err.status === 404 && err.code === 'SKIN_NOT_FOUND',
  );
  // P3c 后 id/slug 解析走 skin_products 反范式化行——无商品行的皮肤（免费）
  // 在下单路径表现为 SKIN_NOT_FOUND（可下单性与存在性同源）
  await assert.rejects(
    () => createSkinOrder({ userId, skinId: 'free-fixture', idempotencyKey: 'k-free' }),
    (err: ApiError) => err.status === 404 && err.code === 'SKIN_NOT_FOUND',
  );
  try {
    await database.prepare(
      "UPDATE skin_products SET status = 'inactive' WHERE id = 'skin-product-paid-fixture'",
    ).run();
    await assert.rejects(
      () => createSkinOrder({ userId, skinId: 'paid-fixture', idempotencyKey: 'k-off' }),
      (err: ApiError) => err.status === 422 && err.code === 'SKIN_PRODUCT_INACTIVE',
    );
  } finally {
    await database.prepare(
      "UPDATE skin_products SET status = 'active' WHERE id = 'skin-product-paid-fixture'",
    ).run();
  }
});

test('verify（模板 /purchases/verify 委托路径）→ success + 权益 + 付费 manifest 200', async () => {
  const userId = await makeUser('app1');
  const order = await createSkinOrder({ userId, skinId: 'paid-fixture', idempotencyKey: `sko-v-${userId}` });
  const done = await verifyViaTemplate(userId, order.orderId);
  assert.equal(done.status, 'success');
  assert.equal(await activeEntitlementCount(userId, 'skin.official.paid-fixture'), 1);

  const envelope = await getCurrentManifest('paid-fixture', userId);
  assert.equal(envelope.slug, 'paid-fixture');
});

test('同一订单 verify 重放 10 次 → 权益只发放一次', async () => {
  const userId = await makeUser('app1');
  const order = await createSkinOrder({ userId, skinId: 'paid-fixture', idempotencyKey: `sko-r-${userId}` });
  for (let i = 0; i < 10; i++) {
    const done = await verifySkinOrder({
      appId: 'app1', environment: 'development', userId, orderId: order.orderId, receipt: {},
    });
    assert.equal(done.status, 'success');
  }
  assert.equal(await activeEntitlementCount(userId, 'skin.official.paid-fixture'), 1);
});

test('退款 webhook 重放 10 次 → 撤销一次，manifest 翻回 403', async () => {
  const userId = await makeUser('app1');
  const order = await createSkinOrder({ userId, skinId: 'paid-fixture', idempotencyKey: `sko-f-${userId}` });
  await verifyViaTemplate(userId, order.orderId);
  assert.ok(await getCurrentManifest('paid-fixture', userId));

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
  assert.equal(await activeEntitlementCount(userId, 'skin.official.paid-fixture'), 0);
  await assert.rejects(
    () => getCurrentManifest('paid-fixture', userId),
    (err: ApiError) => err.status === 403 && err.code === 'SKIN_NOT_ENTITLED',
  );
});

test('恢复购买：皮肤权益键出现在 active entitlements（restore 端点数据源）', async () => {
  const userId = await makeUser('app1');
  const order = await createSkinOrder({ userId, skinId: 'paid-fixture', idempotencyKey: `sko-restore-${userId}` });
  await verifyViaTemplate(userId, order.orderId);
  const keys = (await listActiveEntitlements(userId, 'app1')).map((e) => e.entitlement_key);
  assert.ok(keys.includes('skin.official.paid-fixture'));
});

test('中断恢复：pending 查单 → verify → success + entitled=true', async () => {
  const userId = await makeUser('app1');
  const created = await createSkinOrder({ userId, skinId: 'paid-fixture', idempotencyKey: `sko-i-${userId}` });
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
  const order = await createSkinOrder({ userId: owner, skinId: 'paid-fixture', idempotencyKey: `sko-x-${owner}` });
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
  assert.equal(await activeEntitlementCount(attacker, 'skin.official.paid-fixture'), 0);
});

test('verify 失败：订单 failed、不发权益、manifest 仍 403', async () => {
  const userId = await makeUser('app1');
  const order = await createSkinOrder({ userId, skinId: 'paid-fixture', idempotencyKey: `sko-bad-${userId}` });
  const done = await verifySkinOrder({
    appId: 'app1', environment: 'development', userId, orderId: order.orderId,
    receipt: { fail: true },
  });
  assert.equal(done.status, 'failed');
  assert.equal(await activeEntitlementCount(userId, 'skin.official.paid-fixture'), 0);
  await assert.rejects(
    () => getCurrentManifest('paid-fixture', userId),
    (err: ApiError) => err.status === 403,
  );
});
