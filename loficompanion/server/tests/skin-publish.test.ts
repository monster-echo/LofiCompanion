import assert from 'node:assert/strict';
import test, { after } from 'node:test';
const { database, nowIso } = await import('../src/server/database.ts');
const { getCurrentManifest, listPublishedSkins } = await import('../src/features/skins/data/skin-repository.ts');
const { publishSkin, listAllSkinsForAdmin } = await import('../src/features/skins/data/skin-publish-service.ts');

/**
 * 皮肤发布服务测试（P0-B 免审核发新皮肤）：版本递增、manifest 归一化盖章、
 * posterUrl 租户前缀纪律、paid 商品行与匿名门禁。slug 带 pid 避免库间串扰。
 */

const SCOPE = { appId: 'loficompanion', environment: 'production' } as const;
const SLUG = `publish-test-${process.pid}`;
const PAID_SLUG = `publish-paid-${process.pid}`;

function manifestDraft(posterKey: string) {
  return {
    slug: SLUG,
    name: '发布测试皮肤',
    accessType: 'free',
    defaultState: 'ready',
    themeTokens: { accent: '#4F8FE8', surface: '#0D1B2B' },
    states: [
      { state: 'ready', posterUrl: posterKey, focalPointX: 0.5, focalPointY: 0.38, durationMs: 4000 },
      { state: 'focusing', posterUrl: posterKey, focalPointX: 0.5, focalPointY: 0.38, durationMs: 4000 },
    ],
  };
}

after(async () => database.close());

test('发布免费皮肤 v1：入库盖章、公开目录可见、清单管理面可查', async () => {
  const result = await publishSkin(SCOPE, {
    slug: SLUG,
    name: '发布测试皮肤',
    accessType: 'free',
    manifest: manifestDraft(`loficompanion/production/skins/${SLUG}/ready.png`),
  }, 'test');
  assert.equal(result.skinId, `skin-${SLUG}`);
  assert.equal(result.manifestVersion, 1);

  // manifest 由服务端盖章：id/slug/accessType/manifestVersion 以服务端为准
  const current = await getCurrentManifest(SLUG);
  assert.equal(current.manifestVersion, 1);
  const manifest = current.manifest as Record<string, unknown>;
  assert.equal(manifest.id, `${SLUG}-v1`);
  assert.equal(manifest.slug, SLUG);
  assert.equal(manifest.accessType, 'free');

  const catalog = await listPublishedSkins();
  const hit = catalog.find((skin) => skin.slug === SLUG);
  assert.ok(hit, '已发布皮肤必须在公开目录');
  assert.equal(hit!.posterUrl, `loficompanion/production/skins/${SLUG}/ready.png`);

  const adminList = await listAllSkinsForAdmin();
  assert.ok(adminList.some((skin) => skin.slug === SLUG));
});

test('重发递增版本（不覆盖历史）；非法入参被拒', async () => {
  const again = await publishSkin(SCOPE, {
    slug: SLUG,
    name: '发布测试皮肤改',
    accessType: 'free',
    manifest: manifestDraft(`loficompanion/production/skins/${SLUG}/v2-ready.png`),
  }, 'test');
  assert.equal(again.manifestVersion, 2);

  // v1 历史不可变：GetCurrentManifest 返回最新版；v1 行仍在
  const v1 = await database.prepare(
    'SELECT manifest FROM skin_manifests WHERE skin_id = ? AND version = 1',
  ).get(`skin-${SLUG}`) as { manifest: string } | undefined;
  assert.ok(v1, 'v1 manifest 必须保留');
  const current = await getCurrentManifest(SLUG);
  assert.equal(current.manifestVersion, 2);
  assert.equal((current.manifest as { name?: string }).name, '发布测试皮肤改');

  // posterUrl 纪律：http(s) / s3:// / 错租户前缀 / 占位路径全部拒绝
  const badPosters = [
    'https://evil.example/a.png',
    's3://bucket/key.png',
    'otherapp/production/skins/a.png',
    '/skins/legacy-placeholder.png',
  ];
  for (const posterUrl of badPosters) {
    await assert.rejects(
      () => publishSkin(SCOPE, {
        slug: SLUG, name: 'x', accessType: 'free', manifest: manifestDraft(posterUrl),
      }, 'test'),
      (error: { code?: string }) => error.code === 'INVALID_POSTER_URL',
    );
  }

  await assert.rejects(
    () => publishSkin(SCOPE, {
      slug: 'BAD_SLUG', name: 'x', accessType: 'free', manifest: manifestDraft('loficompanion/production/a.png'),
    }, 'test'),
    (error: { code?: string }) => error.code === 'INVALID_SLUG',
  );

  await assert.rejects(
    () => publishSkin(SCOPE, {
      slug: `${SLUG}-b`, name: 'x', accessType: 'paid', manifest: manifestDraft('loficompanion/production/a.png'),
    }, 'test'),
    (error: { code?: string }) => error.code === 'INVALID_PRICE',
  );
});

test('paid 皮肤：保底商品行落库；匿名取 manifest 走门禁 401', async () => {
  const result = await publishSkin(SCOPE, {
    slug: PAID_SLUG,
    name: '付费测试皮肤',
    accessType: 'paid',
    priceMinor: 600,
    manifest: manifestDraft(`loficompanion/production/skins/${PAID_SLUG}/ready.png`),
  }, 'test');
  assert.equal(result.manifestVersion, 1);

  const product = await database.prepare(
    'SELECT entitlement_key, price_minor, status FROM skin_products WHERE skin_id = ?',
  ).get(`skin-${PAID_SLUG}`) as { entitlement_key: string; price_minor: number; status: string };
  assert.equal(product.entitlement_key, `skin.official.${PAID_SLUG}`);
  assert.equal(product.price_minor, 600);
  assert.equal(product.status, 'active');

  // 匿名（无 userId）：付费 manifest 401（UNAUTHORIZED），免费皮肤不受影响
  await assert.rejects(
    () => getCurrentManifest(PAID_SLUG),
    (error: { code?: string }) => error.code === 'UNAUTHORIZED',
  );
  const free = await getCurrentManifest(SLUG);
  assert.equal(free.slug, SLUG);
});
