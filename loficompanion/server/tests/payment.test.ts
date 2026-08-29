import assert from 'node:assert/strict';
import test, { after } from 'node:test';
type ApiError = { status: number; code: string };

// ALL imports at the top, before any test() — avoids node:test firing after() early.
const { database } = await import('../src/server/database.ts');
const { defaultConfig } = await import('../src/domain/config.ts');
const { runtimeConfigSchema, verifyPurchaseSchema, restorePurchasesSchema } = await import('../src/server/schemas.ts');
const { paymentProvider, storeKeyForPlatform } = await import('../src/server/payment-providers.ts');
const { issueEntitlements, revokeEntitlementsForOrder, listActiveEntitlements } = await import('../src/server/entitlement-service.ts');
const {
  insertPendingOrder, completeOrder, findOrderById, findOrderByReceiptHash,
  insertWebhookEventIfNew, upsertSubscription, getCurrentSubscription,
} = await import('../src/server/order-repository.ts');
const { createOrder, verifyPurchase, restorePurchases } = await import('../src/server/order-service.ts');
const { runTransaction } = await import('../src/server/database.ts');
const { applyWebhook } = await import('../src/server/webhook-service.ts');
const { paymentContractSnapshot } = await import('../src/server/contract-snapshot.ts');

after(async () => database.close());

async function makeUser(appId: string): Promise<string> {
  const id = `u-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  const ts = new Date().toISOString();
  await database.prepare(
    `INSERT INTO users(id, app_id, email, password_hash, username, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, appId, `t-${id}@test.local`, 'hash', id, ts, ts);
  return id;
}

async function makeOrder(orderId: string, userId: string): Promise<string> {
  const ts = new Date().toISOString();
  await database.prepare(
    `INSERT INTO orders(id, user_id, plan_id, tier_id, idempotency_key, status, amount_minor, currency, provider, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(orderId, userId, 'pro-monthly', 'pro', `k-${orderId}`, 'success', 1800, 'CNY', 'mock', ts);
  return orderId;
}

function configWith(mappedPlan = true) {
  return {
    ...defaultConfig,
    plans: [{
      id: 'pro-monthly', tierId: 'pro', name: 'Pro', interval: 'month' as const,
      priceMinor: 1800, currency: 'CNY', provider: 'mock' as const,
      storeProductMapping: mappedPlan
        ? { apple: 'com.x.pro', google: 'pro_g', hms: 'pro_h' }
        : { google: 'pro_g' },
    }],
  };
}

async function seedSucceededOrder(userId: string): Promise<string> {
  const { orderId } = await createOrder({
    userId, idempotencyKey: `w-${Math.random().toString(36).slice(2, 8)}`,
    planId: 'pro-monthly', platform: 'ios', config: configWith(),
  });
  return (await verifyPurchase({
    appId: 'app1', environment: 'development', userId, orderId,
    receipt: { productId: 'com.x.pro' }, platform: 'ios', config: configWith(),
  })).id;
}

test('BillingPlan 支持 storeProductMapping 与 hms provider', () => {
  const plan = {
    id: 'pro-monthly', tierId: 'pro', name: 'Pro 月度', interval: 'month',
    priceMinor: 1800, currency: 'CNY', provider: 'hms' as const,
    storeProductMapping: { hms: 'pro.monthly_001' },
  };
  const parsed = runtimeConfigSchema.parse({ ...defaultConfig, plans: [plan] });
  assert.equal(parsed.plans[0].storeProductMapping?.hms, 'pro.monthly_001');
});

test('provider 为 apple/google/hms 但缺对应映射时 schema 拒绝', () => {
  const plan = {
    id: 'bad', tierId: 'pro', name: 'Bad', interval: 'month',
    priceMinor: 100, currency: 'CNY', provider: 'apple' as const,
    storeProductMapping: { google: 'x' },
  };
  assert.throws(() => runtimeConfigSchema.parse({ ...defaultConfig, plans: [plan] }));
});

test('购买请求 schema 校验', () => {
  assert.ok(verifyPurchaseSchema.safeParse({ receipt: { productId: 'p' } }).success);
  assert.ok(verifyPurchaseSchema.safeParse({ orderId: 'o1', receipt: {} }).success);
  assert.equal(verifyPurchaseSchema.safeParse({}).success, false);
  assert.ok(restorePurchasesSchema.safeParse({ receipts: [{ productId: 'p' }] }).success);
  assert.equal(restorePurchasesSchema.safeParse({ receipts: [] }).success, false);
});

test('新表与 orders 新列存在', async () => {
  const tables = await database.prepare(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('user_entitlements', 'subscriptions', 'webhook_events')
  `).all() as { table_name: string }[];
  const names = tables.map((t) => t.table_name).sort();
  assert.deepEqual(names, ['subscriptions', 'user_entitlements', 'webhook_events']);

  const cols = await database.prepare(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name IN
      ('store_transaction_id', 'receipt_hash', 'expires_at', 'tier_id')
  `).all() as { column_name: string }[];
  assert.deepEqual(cols.map((c) => c.column_name).sort(),
    ['expires_at', 'receipt_hash', 'store_transaction_id', 'tier_id']);
});

test('mock 适配器 verifyReceipt 成功路径', async () => {
  const r = await paymentProvider('mock', 'development').verifyReceipt({
    appId: 'a', userId: 'u', receipt: { productId: 'p' },
  });
  assert.equal(r.ok, true);
  assert.equal(r.productId, 'p');
  assert.ok(r.storeTransactionId);
});

test('mock 适配器 verifyReceipt 失败路径', async () => {
  const r = await paymentProvider('mock', 'development').verifyReceipt({
    appId: 'a', userId: 'u', receipt: { fail: true },
  });
  assert.equal(r.ok, false);
});

test('未配置渠道 verifyReceipt 抛 503，parseWebhook 抛 401', async () => {
  // Apple adapter now exists (StoreKit2 JWS verification); without a JWS string
  // receipt it short-circuits to { ok: false } rather than throwing. Real Apple
  // crypto coverage lives in payment-apple.test.ts.
  const apple = await paymentProvider('apple', 'development').verifyReceipt({ appId: 'a', userId: 'u', receipt: {} });
  assert.equal(apple.ok, false);
  await assert.rejects(
    () => paymentProvider('google', 'development').parseWebhook(Buffer.from('{}'), {}),
    (err: ApiError) => err.status === 401 && err.code === 'WEBHOOK_SIGNATURE_INVALID',
  );
});

test('生产环境禁用 mock', () => {
  assert.throws(
    () => paymentProvider('mock', 'production'),
    (err: ApiError) => err.status === 503 && err.code === 'MOCK_PAYMENT_FORBIDDEN',
  );
});

test('platform → storeKey 解析', () => {
  assert.equal(storeKeyForPlatform('ios'), 'apple');
  assert.equal(storeKeyForPlatform('android'), 'google');
  assert.equal(storeKeyForPlatform('harmonyos'), 'hms');
  assert.equal(storeKeyForPlatform('web'), undefined);
});

test('issueEntitlements 按 tier 发放权益且幂等', async () => {
  const userId = await makeUser('app1');
  await makeOrder('o1', userId);
  const tier = defaultConfig.tiers.find((t) => t.id === 'pro')!;
  await issueEntitlements({ userId, appId: 'app1', orderId: 'o1', tier, expiresAt: null });
  await issueEntitlements({ userId, appId: 'app1', orderId: 'o1', tier, expiresAt: null });
  const keys = (await listActiveEntitlements(userId, 'app1')).map((e) => e.entitlement_key).sort();
  assert.deepEqual(keys, ['cloud.100gb', 'export.hd', 'templates.pro']);
});

test('revokeEntitlementsForOrder 撤销该订单权益', async () => {
  const userId = await makeUser('app1');
  await makeOrder('o2', userId);
  const tier = defaultConfig.tiers.find((t) => t.id === 'pro')!;
  await issueEntitlements({ userId, appId: 'app1', orderId: 'o2', tier, expiresAt: null });
  await revokeEntitlementsForOrder('o2');
  const keys = await listActiveEntitlements(userId, 'app1');
  assert.equal(keys.length, 0);
});

test('insertPendingOrder 创建 pending 订单', async () => {
  const userId = await makeUser('app1');
  const order = await insertPendingOrder({
    userId, planId: 'pro-monthly', tierId: 'pro',
    idempotencyKey: 'k1', amountMinor: 1800, currency: 'CNY', provider: 'mock',
  });
  assert.equal(order.status, 'pending');
  assert.equal(order.userId, userId);
});

test('completeOrder 置 success 并写入票据字段', async () => {
  const userId = await makeUser('app1');
  const order = await insertPendingOrder({
    userId, planId: 'pro-monthly', tierId: 'pro',
    idempotencyKey: 'k2', amountMinor: 1800, currency: 'CNY', provider: 'mock',
  });
  const done = await completeOrder(order.id, {
    storeTransactionId: 't1', receiptHash: 'h1', expiresAt: null,
  });
  assert.equal(done.status, 'success');
  const found = await findOrderByReceiptHash(userId, 'h1');
  assert.ok(found);
  assert.equal(found!.id, order.id);
});

test('insertWebhookEventIfNew 第二次返回 false（去重）', async () => {
  const first = await insertWebhookEventIfNew({ provider: 'mock', eventId: 'e1', payloadHash: 'p' });
  const second = await insertWebhookEventIfNew({ provider: 'mock', eventId: 'e1', payloadHash: 'p' });
  assert.equal(first, true);
  assert.equal(second, false);
});

test('upsertSubscription 同 plan 幂等更新', async () => {
  const userId = await makeUser('app1');
  await makeOrder('sub1', userId);
  await makeOrder('sub2', userId);
  await upsertSubscription({
    userId, appId: 'app1', planId: 'pro-monthly', platform: 'ios',
    status: 'active', currentOrderId: 'sub1', renewAt: null,
  });
  await upsertSubscription({
    userId, appId: 'app1', planId: 'pro-monthly', platform: 'ios',
    status: 'active', currentOrderId: 'sub2', renewAt: null,
  });
  const sub = await getCurrentSubscription(userId, 'app1', 'pro-monthly');
  assert.ok(sub);
  assert.equal(sub!.current_order_id, 'sub2');
});

test('createOrder 返回 pending + storeProductId，且幂等', async () => {
  const userId = await makeUser('app1');
  const a = await createOrder({ userId, idempotencyKey: 'i1', planId: 'pro-monthly', platform: 'ios', config: configWith() });
  const b = await createOrder({ userId, idempotencyKey: 'i1', planId: 'pro-monthly', platform: 'ios', config: configWith() });
  assert.equal(a.status, 'pending');
  assert.equal(a.storeProductId, 'com.x.pro');
  assert.equal(a.orderId, b.orderId);
});

test('createOrder 无对应平台映射 → PRODUCT_NOT_MAPPED', async () => {
  const userId = await makeUser('app1');
  await assert.rejects(
    () => createOrder({ userId, idempotencyKey: 'i2', planId: 'pro-monthly', platform: 'ios', config: configWith(false) }),
    (err: ApiError) => err.status === 404 && err.code === 'PRODUCT_NOT_MAPPED',
  );
});

test('verifyPurchase 成功 → order success + 发权益 + 幂等', async () => {
  const userId = await makeUser('app1');
  const { orderId } = await createOrder({ userId, idempotencyKey: 'i3', planId: 'pro-monthly', platform: 'ios', config: configWith() });
  const receipt = { productId: 'com.x.pro' };
  const r1 = await verifyPurchase({ appId: 'app1', environment: 'development', userId, orderId, receipt, platform: 'ios', config: configWith() });
  const r2 = await verifyPurchase({ appId: 'app1', environment: 'development', userId, orderId, receipt, platform: 'ios', config: configWith() });
  assert.equal(r1.status, 'success');
  assert.equal(r2.status, 'success');
  const ents = (await listActiveEntitlements(userId, 'app1')).map((e) => e.entitlement_key).sort();
  assert.deepEqual(ents, ['cloud.100gb', 'export.hd', 'templates.pro']);
});

test('verifyPurchase 失败 → order failed，不发权益', async () => {
  const userId = await makeUser('app1');
  const { orderId } = await createOrder({ userId, idempotencyKey: 'i4', planId: 'pro-monthly', platform: 'ios', config: configWith() });
  const r = await verifyPurchase({ appId: 'app1', environment: 'development', userId, orderId, receipt: { fail: true }, platform: 'ios', config: configWith() });
  assert.equal(r.status, 'failed');
  assert.equal((await listActiveEntitlements(userId, 'app1')).length, 0);
});

test('restorePurchases 按 productId 反查并补发（orderId 缺省）', async () => {
  const userId = await makeUser('app1');
  await restorePurchases({ appId: 'app1', environment: 'development', userId, receipts: [{ productId: 'com.x.pro' }], platform: 'ios', config: configWith() });
  const ents = (await listActiveEntitlements(userId, 'app1')).map((e) => e.entitlement_key).sort();
  assert.deepEqual(ents, ['cloud.100gb', 'export.hd', 'templates.pro']);
});

test('verifyPurchase 拒绝跨用户订单（ORDER_NOT_FOUND，不泄露存在性）', async () => {
  const owner = await makeUser('app1');
  const attacker = await makeUser('app1');
  const { orderId } = await createOrder({
    userId: owner, idempotencyKey: `own-${Math.random().toString(36).slice(2, 8)}`,
    planId: 'pro-monthly', platform: 'ios', config: configWith(),
  });
  await assert.rejects(
    () => verifyPurchase({
      appId: 'app1', environment: 'development', userId: attacker, orderId,
      receipt: { productId: 'com.x.pro' }, platform: 'ios', config: configWith(),
    }),
    (err: ApiError) => err.status === 404 && err.code === 'ORDER_NOT_FOUND',
  );
  assert.equal((await listActiveEntitlements(attacker, 'app1')).length, 0);
});

test('嵌套事务中内层写入随外层回滚而回滚（原子性）', async () => {
  await assert.rejects(
    () => runTransaction(async () => {
      const inserted = await insertWebhookEventIfNew({ provider: 'mock', eventId: 'sp-atomic', payloadHash: 'p' });
      assert.equal(inserted, true);
      throw new Error('outer fails after nested write');
    }),
    /outer fails after nested write/,
  );
  const row = await database.prepare(
    'SELECT 1 AS ok FROM webhook_events WHERE provider = ? AND event_id = ?',
  ).get('mock', 'sp-atomic');
  assert.equal(row, undefined, '嵌套事务的写入必须随外层回滚而消失');
});

test('同一 webhook 投递 10 次只处理 1 次', async () => {
  const userId = await makeUser('app1');
  const orderId = await seedSucceededOrder(userId);
  const body = Buffer.from(JSON.stringify({ eventId: 'e10', kind: 'refund', orderId }));
  for (let i = 0; i < 10; i++) {
    await applyWebhook('mock', body, {});
  }
  const order = await findOrderById(orderId);
  assert.equal(order!.status, 'refunded');
  assert.equal((await listActiveEntitlements(userId, 'app1')).length, 0);
});

test('非 mock 渠道 webhook 在 P-1 返回 401（验签骨架）', async () => {
  await assert.rejects(
    () => applyWebhook('apple', Buffer.from('{}'), {}),
    (err: ApiError) => err.status === 401 && err.code === 'WEBHOOK_SIGNATURE_INVALID',
  );
});

test('契约快照导出 order/verify/restore/membership 的 JSON Schema', () => {
  const snap = paymentContractSnapshot as Record<string, unknown>;
  assert.equal(snap.type, 'object');
  const props = snap.properties as Record<string, unknown>;
  for (const key of ['orderRequest', 'verifyRequest', 'restoreRequest']) {
    assert.ok(props[key], `missing ${key}`);
  }
});
