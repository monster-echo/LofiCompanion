import assert from 'node:assert/strict';
import test, { after } from 'node:test';
type ApiError = { status: number; code: string };

// ALL imports at the top, before any test() — avoids node:test firing after() early.
const { database } = await import('../src/server/database.ts');
const { listSkinProducts, findSkinProductBySkinId } = await import('../src/features/skins/data/product-repository.ts');
const { getCurrentManifest } = await import('../src/features/skins/data/skin-repository.ts');
const { issueEntitlements, revokeEntitlementsForOrder, listActiveEntitlements } = await import('../src/server/entitlement-service.ts');
const { seedLofiDefaults } = await import('../src/server/database-schema-lofi.ts');

after(async () => database.close());

// 夹具幂等清理（模式同 payment.test.ts）：本地持久库重跑时先清，
// 并把夹具商品恢复在售，避免上一轮崩溃残留 inactive 状态。
{
  await database.prepare(
    "DELETE FROM user_entitlements WHERE source_order_id IN ('sp-ent-1', 'sp-ent-2')",
  ).run();
  await database.prepare(
    "DELETE FROM orders WHERE idempotency_key LIKE 'sp-key-%'",
  ).run();
  await database.prepare(
    "UPDATE skin_products SET status = 'active' WHERE id = 'skin-product-paid-fixture'",
  ).run();
}

// 合成夹具：种子皮肤已全免费（doc-01 PRD）。付费/订阅 manifest 门禁与商品
// 目录能力（docs/05）保留，覆盖改走这套夹具——paid 带商品行（单买键），
// premium 不带商品行（验证键回退 catalog.premium.active 的 Plus 语义）。
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
  await database.prepare(
    `INSERT INTO skins(id, slug, name, access_type, manifest_version, moderation_status, published_at, created_at)
     VALUES ('skin-premium-fixture', 'premium-fixture', 'Plus测试皮肤', 'premium', 1, 'approved', ?, ?)
     ON CONFLICT (id) DO NOTHING`,
  ).run(ts, ts);
  await database.prepare(
    `INSERT INTO skin_manifests(id, skin_id, version, manifest, created_at)
     VALUES ('skin-manifest-premium-fixture-1', 'skin-premium-fixture', 1, ?, ?)
     ON CONFLICT (skin_id, version) DO NOTHING`,
  ).run(JSON.stringify({ id: 'premium-fixture-v1', slug: 'premium-fixture', states: [], eventMappings: [] }), ts);
}

const SKIN_TIER = {
  id: 'skin', name: 'Skin', summary: '', recommended: false, accent: '#000000',
  entitlements: ['skin.official.paid-fixture'] as readonly string[],
};

async function makeUser(appId: string): Promise<string> {
  const id = `u-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  const ts = new Date().toISOString();
  await database.prepare(
    `INSERT INTO users(id, app_id, email, password_hash, username, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, appId, `t-${id}@test.local`, 'hash', id, ts, ts);
  return id;
}

async function grantSkinEntitlement(userId: string, orderId: string, key: string): Promise<void> {
  const ts = new Date().toISOString();
  await database.prepare(
    `INSERT INTO orders(id, user_id, plan_id, tier_id, idempotency_key, status, amount_minor, currency, provider, created_at)
     VALUES (?, ?, 'skin-product-paid-fixture', 'free', ?, 'success', 1200, 'CNY', 'mock', ?)
     ON CONFLICT (id) DO NOTHING`,
  ).run(orderId, userId, `sp-key-${orderId}`, ts);
  await issueEntitlements({
    userId, appId: 'app1', orderId,
    tier: { ...SKIN_TIER, entitlements: [key] }, expiresAt: null,
  });
}

test('种子：三套皮肤全免费发布，商品目录为空', async () => {
  const rows = await database.prepare(
    `SELECT slug, access_type, moderation_status FROM skins WHERE slug IN
       ('rainy-study-room', 'sunny-classroom', 'midnight-workstation')`,
  ).all() as Array<{ slug: string; access_type: string; moderation_status: string }>;
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  assert.equal(bySlug.size, 3);
  for (const slug of ['rainy-study-room', 'sunny-classroom', 'midnight-workstation']) {
    assert.equal(bySlug.get(slug)!.access_type, 'free', slug);
    assert.equal(bySlug.get(slug)!.moderation_status, 'approved', slug);
  }
  // 免费皮肤无商品行（含早期演示商品的存量清理）；夹具商品不算种子
  const slugs = (await listSkinProducts()).map((p) => p.slug);
  assert.ok(!slugs.includes('rainy-study-room'));
  assert.ok(!slugs.includes('sunny-classroom'));
  assert.ok(!slugs.includes('midnight-workstation'));
  assert.equal(await findSkinProductBySkinId('skin-sunny-classroom'), undefined);
  assert.equal(await findSkinProductBySkinId('skin-midnight-workstation'), undefined);
});

test('种子幂等：重跑 seedLofiDefaults 不产生商品；存量 paid/pending 行刷平为免费发布', async () => {
  // 模拟早期种子遗留的旧语义行
  await database.prepare(
    `UPDATE skins SET access_type = 'paid', moderation_status = 'pending_assets', published_at = NULL
     WHERE slug = 'sunny-classroom'`,
  ).run();
  await seedLofiDefaults(database);
  const sunny = await database.prepare(
    `SELECT access_type, moderation_status, published_at FROM skins WHERE slug = 'sunny-classroom'`,
  ).get() as { access_type: string; moderation_status: string; published_at: string | null };
  assert.equal(sunny.access_type, 'free');
  assert.equal(sunny.moderation_status, 'approved');
  assert.ok(sunny.published_at);
  const slugs = (await listSkinProducts()).map((p) => p.slug);
  assert.ok(!slugs.includes('sunny-classroom'));
  assert.ok(!slugs.includes('midnight-workstation'));
});

test('目录只列在售商品并联表暴露皮肤信息（夹具）', async () => {
  const products = await listSkinProducts();
  const paid = products.find((p) => p.slug === 'paid-fixture');
  assert.ok(paid);
  assert.equal(paid!.accessType, 'paid');
  assert.equal(paid!.entitlementKey, 'skin.official.paid-fixture');
  assert.equal(paid!.priceMinor, 1200);
  assert.equal(paid!.skinName, '付费测试皮肤');
  // premium 夹具无商品行：不进目录
  assert.ok(!products.some((p) => p.slug === 'premium-fixture'));
});

test('目录只列 active：下架商品从目录消失（测试后恢复）', async () => {
  try {
    await database.prepare(
      "UPDATE skin_products SET status = 'inactive' WHERE id = 'skin-product-paid-fixture'",
    ).run();
    const slugs = (await listSkinProducts()).map((p) => p.slug);
    assert.ok(!slugs.includes('paid-fixture'));
  } finally {
    await database.prepare(
      "UPDATE skin_products SET status = 'active' WHERE id = 'skin-product-paid-fixture'",
    ).run();
  }
});

test('付费 manifest：匿名 401（slug 与 id 均拒绝）', async () => {
  await assert.rejects(
    () => getCurrentManifest('paid-fixture'),
    (err: ApiError) => err.status === 401 && err.code === 'UNAUTHORIZED',
  );
  await assert.rejects(
    () => getCurrentManifest('skin-paid-fixture'),
    (err: ApiError) => err.status === 401,
  );
});

test('付费 manifest：登录但无权益 403 SKIN_NOT_ENTITLED', async () => {
  const userId = await makeUser('app1');
  await assert.rejects(
    () => getCurrentManifest('paid-fixture', userId),
    (err: ApiError) => err.status === 403 && err.code === 'SKIN_NOT_ENTITLED',
  );
});

test('付费 manifest：发放 skin.official 权益后可取，撤销后再次 403', async () => {
  const userId = await makeUser('app1');
  await grantSkinEntitlement(userId, 'sp-ent-1', 'skin.official.paid-fixture');

  const envelope = await getCurrentManifest('paid-fixture', userId);
  assert.equal(envelope.slug, 'paid-fixture');
  assert.equal(envelope.manifestVersion, 1);
  const byId = await getCurrentManifest(envelope.skinId, userId);
  assert.equal(byId.skinId, envelope.skinId);

  await revokeEntitlementsForOrder('sp-ent-1');
  await assert.rejects(
    () => getCurrentManifest('paid-fixture', userId),
    (err: ApiError) => err.status === 403 && err.code === 'SKIN_NOT_ENTITLED',
  );
});

test('premium manifest：catalog.premium.active 权益可取；单买皮肤权益不通用', async () => {
  const userId = await makeUser('app1');
  await grantSkinEntitlement(userId, 'sp-ent-2', 'skin.official.paid-fixture');
  // 只有单买权益的用户的 Plus 皮肤仍然 403——权益键必须精确匹配。
  await assert.rejects(
    () => getCurrentManifest('premium-fixture', userId),
    (err: ApiError) => err.status === 403 && err.code === 'SKIN_NOT_ENTITLED',
  );

  await issueEntitlements({
    userId, appId: 'app1', orderId: 'sp-ent-2',
    tier: { ...SKIN_TIER, entitlements: ['catalog.premium.active'] }, expiresAt: null,
  });
  // premium 夹具无商品行：键回退 catalog.premium.active（docs/05 §4 Plus 语义）
  const envelope = await getCurrentManifest('premium-fixture', userId);
  assert.equal(envelope.slug, 'premium-fixture');
});

test('免费皮肤 manifest 永不设门禁：匿名与无权益用户均可取（三套种子皮肤）', async () => {
  const anonymous = await getCurrentManifest('rainy-study-room');
  assert.equal(anonymous.slug, 'rainy-study-room');
  for (const slug of ['sunny-classroom', 'midnight-workstation']) {
    const envelope = await getCurrentManifest(slug);
    assert.equal(envelope.slug, slug);
  }
  const userId = await makeUser('app1');
  const entitled = await getCurrentManifest('rainy-study-room', userId);
  assert.equal(entitled.skinId, anonymous.skinId);
  assert.equal((await listActiveEntitlements(userId, 'app1')).length, 0);
});
