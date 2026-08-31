import assert from 'node:assert/strict';
import test, { after } from 'node:test';
const { database, nowIso } = await import('../src/server/database.ts');
const { listPublishedSkins, getCurrentManifest } = await import('../src/features/skins/data/skin-repository.ts');

after(async () => database.close());

test('皮肤目录：只含已发布且审核通过的免费皮肤，含 ready poster', async () => {
  const skins = await listPublishedSkins();
  const slugs = skins.map((skin) => skin.slug);
  assert.ok(slugs.includes('rainy-study-room'));
  // doc-01 PRD：阳光教室 / 深夜工作台随资产上线转为免费发布
  assert.ok(slugs.includes('sunny-classroom'));
  assert.ok(slugs.includes('midnight-workstation'));
  const rainy = skins.find((skin) => skin.slug === 'rainy-study-room')!;
  assert.equal(rainy.accessType, 'free');
  assert.equal(rainy.manifestVersion, 1);
  assert.ok(rainy.publishedAt);
  assert.equal(rainy.posterUrl, '/skins/rainy-study-room/ready.png');
  const sunny = skins.find((skin) => skin.slug === 'sunny-classroom')!;
  assert.equal(sunny.accessType, 'free');
  assert.ok(sunny.publishedAt);
  assert.equal(sunny.posterUrl, '/skins/sunny-classroom/ready.png');
});

test('manifest：slug 与 id 均可取当前版本；未知 id 抛 SKIN_NOT_ENTITLED', async () => {
  const bySlug = await getCurrentManifest('rainy-study-room');
  assert.equal(bySlug.slug, 'rainy-study-room');
  assert.equal(bySlug.manifestVersion, 1);
  const manifest = bySlug.manifest as { states: Array<{ state: string }> };
  assert.equal(manifest.states.length, 6);

  const byId = await getCurrentManifest(bySlug.skinId);
  assert.equal(byId.skinId, bySlug.skinId);

  await assert.rejects(
    () => getCurrentManifest('skin-nonexistent'),
    (error: { code?: string }) => error.code === 'SKIN_NOT_ENTITLED',
  );
});

test('manifest 版本只增不改：同 (skin_id, version) 重复插入违反唯一约束', async () => {
  const rainy = await getCurrentManifest('rainy-study-room');
  await assert.rejects(
    () => database.prepare(
      `INSERT INTO skin_manifests(id, skin_id, version, manifest, created_at)
       VALUES (?, ?, 1, '{}', ?)`,
    ).run(`skin-manifest-dup-${process.pid}`, rainy.skinId, nowIso()),
    (error: { code?: string }) => error.code === '23505',
  );
});
