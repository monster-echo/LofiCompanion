import assert from 'node:assert/strict';
import test, { after } from 'node:test';
// ALL imports at the top, before any test() — avoids node:test firing after() early.
const { database, nowIso } = await import('../src/server/database.ts');
const { initializeLofiSchema, seedLofiDefaults } = await import('../src/server/database-schema-lofi.ts');

after(async () => database.close());

async function makeUser(appId: string): Promise<string> {
  const id = `su-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  const ts = new Date().toISOString();
  await database.prepare(
    `INSERT INTO users(id, app_id, email, password_hash, username, created_at, updated_at)
     VALUES (?, ?, ?, 'hash', ?, ?, ?)`,
  ).run(id, appId, `${id}@test.local`, id, ts, ts);
  return id;
}

test('lofi schema 初始化与种子幂等：连续两次执行不报错且不重复', async () => {
  await initializeLofiSchema(database);
  await seedLofiDefaults(database);
  await initializeLofiSchema(database);
  await seedLofiDefaults(database);
  const skins = await database.prepare(
    `SELECT count(*) AS n FROM skins WHERE slug IN ('rainy-study-room', 'sunny-classroom', 'midnight-workstation')`,
  ).get() as { n: number };
  const items = await database.prepare('SELECT count(*) AS n FROM room_items').get() as { n: number };
  assert.equal(skins.n, 3);
  assert.equal(items.n, 5); // 含 P0-C weekly_group_photo
});

test('focus_sessions 同一 (user_id, client_request_id) 二次插入违反唯一约束', async () => {
  const userId = await makeUser('app1');
  const ts = nowIso();
  const reqId = `req-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  await database.prepare(
    `INSERT INTO focus_sessions(id, user_id, activity, planned_seconds, status, started_at, client_request_id, created_at, updated_at)
     VALUES (?, ?, 'homework', 1500, 'completed', ?, ?, ?, ?)`,
  ).run(`fs-${reqId}`, userId, ts, reqId, ts, ts);
  await assert.rejects(
    () => database.prepare(
      `INSERT INTO focus_sessions(id, user_id, activity, planned_seconds, status, started_at, client_request_id, created_at, updated_at)
       VALUES (?, ?, 'homework', 1500, 'completed', ?, ?, ?, ?)`,
    ).run(`fs-${reqId}-dup`, userId, ts, reqId, ts, ts),
    (error: { code?: string }) => error.code === '23505',
  );
});

test('achievement_grants 同一 (user_id, rule_key, rule_version) 只能发放一次', async () => {
  const userId = await makeUser('app1');
  await database.prepare(
    `INSERT INTO achievement_grants(id, user_id, rule_key, rule_version, granted_at)
     VALUES (?, ?, 'first_focus', 1, ?)`,
  ).run(`ag-${process.pid}-${Math.random().toString(36).slice(2, 8)}`, userId, nowIso());
  await assert.rejects(
    () => database.prepare(
      `INSERT INTO achievement_grants(id, user_id, rule_key, rule_version, granted_at)
       VALUES (?, ?, 'first_focus', 1, ?)`,
    ).run(`ag-${process.pid}-${Math.random().toString(36).slice(2, 8)}`, userId, nowIso()),
    (error: { code?: string }) => error.code === '23505',
  );
});

test('focus_sessions planned_seconds 越界被 CHECK 拒绝', async () => {
  const userId = await makeUser('app1');
  await assert.rejects(
    () => database.prepare(
      `INSERT INTO focus_sessions(id, user_id, activity, planned_seconds, status, started_at, client_request_id, created_at, updated_at)
       VALUES (?, ?, 'homework', 299, 'active', ?, ?, ?, ?)`,
    ).run(`fs-short-${process.pid}-${Math.random().toString(36).slice(2, 8)}`, userId, nowIso(), `req-short-${process.pid}`, nowIso(), nowIso()),
    (error: { code?: string }) => error.code === '23514',
  );
});

test('皮肤种子：雨夜书房已发布且 manifest v1 就位，占位皮肤未发布', async () => {
  const rainy = await database.prepare(
    `SELECT s.id, s.published_at, m.manifest FROM skins s
     JOIN skin_manifests m ON m.skin_id = s.id AND m.version = 1
     WHERE s.slug = 'rainy-study-room'`,
  ).get() as { id: string; published_at: string; manifest: string };
  assert.ok(rainy.published_at);
  const manifest = JSON.parse(rainy.manifest) as { states: unknown[]; eventMappings: unknown[] };
  assert.equal(manifest.states.length, 6);
  assert.equal(manifest.eventMappings.length, 8);

  // doc-01 PRD：种子皮肤全免费发布——阳光教室不再停留 pending_assets
  const sunny = await database.prepare(
    `SELECT slug, published_at, moderation_status, access_type FROM skins WHERE slug = 'sunny-classroom'`,
  ).get() as { slug: string; published_at: string | null; moderation_status: string; access_type: string };
  assert.ok(sunny.published_at);
  assert.equal(sunny.moderation_status, 'approved');
  assert.equal(sunny.access_type, 'free');
});
