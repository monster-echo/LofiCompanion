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

// 夹具固定 id 的幂等清理（模式同 payment.test.ts）：本地持久库重跑时先清，
// 并把种子商品恢复在售，避免上一轮崩溃残留 inactive 状态。
{
  await database.prepare(
    "DELETE FROM user_entitlements WHERE source_order_id IN ('sp-ent-1', 'sp-ent-2')",
  ).run();
  await database.prepare(
    "DELETE FROM orders WHERE idempotency_key LIKE 'sp-key-%'",
  ).run();
  await database.prepare(
    "UPDATE skin_products SET status = 'active' WHERE id IN ('skin-product-sunny-classroom', 'skin-product-midnight-workstation')",
  ).run();
}

const SKIN_TIER = {
  id: 'skin', name: 'Skin', summary: '', recommended: false, accent: '#000000',
  entitlements: ['skin.official.sunny-classroom'] as readonly string[],
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
     VALUES (?, ?, 'skin-product-sunny-classroom', 'free', ?, 'success', 1200, 'CNY', 'mock', ?)
     ON CONFLICT (id) DO NOTHING`,
  ).run(orderId, userId, `sp-key-${orderId}`, ts);
  await issueEntitlements({
    userId, appId: 'app1', orderId,
    tier: { ...SKIN_TIER, entitlements: [key] }, expiresAt: null,
  });
}

test('种子：sunny=paid / midnight=premium / rainy 仍 free，商品目录价格正确', async () => {
  const rows = await database.prepare(
    `SELECT slug, access_type FROM skins WHERE slug IN
       ('rainy-study-room', 'sunny-classroom', 'midnight-workstation')`,
  ).all() as Array<{ slug: string; access_type: string }>;
  const bySlug = new Map(rows.map((r) => [r.slug, r.access_type]));
  assert.equal(bySlug.get('rainy-study-room'), 'free');
  assert.equal(bySlug.get('sunny-classroom'), 'paid');
  assert.equal(bySlug.get('midnight-workstation'), 'premium');

  const sunny = await findSkinProductBySkinId('skin-sunny-classroom');
  assert.ok(sunny);
  assert.equal(sunny!.entitlementKey, 'skin.official.sunny-classroom');
  assert.equal(sunny!.priceMinor, 1200);
  assert.equal(sunny!.currency, 'CNY');
  assert.equal(sunny!.status, 'active');
  assert.deepEqual(sunny!.storeProductIds, {});
});

test('种子幂等：重跑 seedLofiDefaults 不产生重复商品、不改收费语义', async () => {
  await seedLofiDefaults(database);
  const products = await listSkinProducts();
  assert.equal(products.filter((p) => p.slug === 'sunny-classroom').length, 1);
  assert.equal(products.filter((p) => p.slug === 'midnight-workstation').length, 1);
  const sunny = await findSkinProductBySkinId('skin-sunny-classroom');
  assert.equal(sunny!.entitlementKey, 'skin.official.sunny-classroom');
});

test('目录只列在售商品并联表暴露皮肤信息；免费皮肤无商品', async () => {
  const products = await listSkinProducts();
  const slugs = products.map((p) => p.slug);
  assert.ok(slugs.includes('sunny-classroom'));
  assert.ok(slugs.includes('midnight-workstation'));
  assert.ok(!slugs.includes('rainy-study-room'), '免费皮肤不应有商品行');

  const midnight = products.find((p) => p.slug === 'midnight-workstation')!;
  assert.equal(midnight.accessType, 'premium');
  assert.equal(midnight.entitlementKey, 'catalog.premium.active');
  assert.equal(midnight.priceMinor, 1800);
  assert.equal(midnight.skinName, '深夜工作台');
});

test('目录只列 active：下架商品从目录消失（测试后恢复）', async () => {
  try {
    await database.prepare(
      "UPDATE skin_products SET status = 'inactive' WHERE id = 'skin-product-midnight-workstation'",
    ).run();
    const slugs = (await listSkinProducts()).map((p) => p.slug);
    assert.ok(!slugs.includes('midnight-workstation'));
    assert.ok(slugs.includes('sunny-classroom'));
  } finally {
    await database.prepare(
      "UPDATE skin_products SET status = 'active' WHERE id = 'skin-product-midnight-workstation'",
    ).run();
  }
});

test('付费 manifest：匿名 401（slug 与 id 均拒绝）', async () => {
  await assert.rejects(
    () => getCurrentManifest('sunny-classroom'),
    (err: ApiError) => err.status === 401 && err.code === 'UNAUTHORIZED',
  );
  await assert.rejects(
    () => getCurrentManifest('skin-sunny-classroom'),
    (err: ApiError) => err.status === 401,
  );
});

test('付费 manifest：登录但无权益 403 SKIN_NOT_ENTITLED', async () => {
  const userId = await makeUser('app1');
  await assert.rejects(
    () => getCurrentManifest('sunny-classroom', userId),
    (err: ApiError) => err.status === 403 && err.code === 'SKIN_NOT_ENTITLED',
  );
});

test('付费 manifest：发放 skin.official 权益后可取，撤销后再次 403', async () => {
  const userId = await makeUser('app1');
  await grantSkinEntitlement(userId, 'sp-ent-1', 'skin.official.sunny-classroom');

  const envelope = await getCurrentManifest('sunny-classroom', userId);
  assert.equal(envelope.slug, 'sunny-classroom');
  assert.equal(envelope.manifestVersion, 1);
  const byId = await getCurrentManifest(envelope.skinId, userId);
  assert.equal(byId.skinId, envelope.skinId);

  await revokeEntitlementsForOrder('sp-ent-1');
  await assert.rejects(
    () => getCurrentManifest('sunny-classroom', userId),
    (err: ApiError) => err.status === 403 && err.code === 'SKIN_NOT_ENTITLED',
  );
});

test('premium manifest：catalog.premium.active 权益可取；单买皮肤权益不通用', async () => {
  const userId = await makeUser('app1');
  await grantSkinEntitlement(userId, 'sp-ent-2', 'skin.official.sunny-classroom');
  // 只有单买权益的用户的 Plus 皮肤仍然 403——权益键必须精确匹配。
  await assert.rejects(
    () => getCurrentManifest('midnight-workstation', userId),
    (err: ApiError) => err.status === 403 && err.code === 'SKIN_NOT_ENTITLED',
  );

  await issueEntitlements({
    userId, appId: 'app1', orderId: 'sp-ent-2',
    tier: { ...SKIN_TIER, entitlements: ['catalog.premium.active'] }, expiresAt: null,
  });
  const envelope = await getCurrentManifest('midnight-workstation', userId);
  assert.equal(envelope.slug, 'midnight-workstation');
});

test('免费皮肤 manifest 永不设门禁：匿名与无权益用户均可取', async () => {
  const anonymous = await getCurrentManifest('rainy-study-room');
  assert.equal(anonymous.slug, 'rainy-study-room');
  const userId = await makeUser('app1');
  const entitled = await getCurrentManifest('rainy-study-room', userId);
  assert.equal(entitled.skinId, anonymous.skinId);
  assert.equal((await listActiveEntitlements(userId, 'app1')).length, 0);
});
