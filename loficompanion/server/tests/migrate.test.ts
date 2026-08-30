import assert from 'node:assert/strict';
import test, { after } from 'node:test';
const { database } = await import('../src/server/database.ts');
const { migrateGuestSessions } = await import('../src/features/focus/data/migrate.ts');
const { listAchievementsForUser, listRoomItemsForUser } = await import('../src/features/achievements/service.ts');

after(async () => database.close());

const uid = () => `mg-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

async function makeUser(): Promise<string> {
  const id = uid();
  const ts = new Date().toISOString();
  await database.prepare(
    `INSERT INTO users(id, app_id, email, password_hash, username, created_at, updated_at)
     VALUES (?, 'zhongbei', ?, 'hash', ?, ?, ?)`,
  ).run(id, `${id}@test.local`, id, ts, ts);
  return id;
}

function payload(clientRequestId: string, seconds = 600) {
  const startedAtUtc = Date.now() - (seconds + 120) * 1000;
  return {
    clientRequestId, activity: 'homework', plannedSeconds: 1500,
    status: 'completed' as const, startedAtUtc,
    pauses: [], completedAtUtc: startedAtUtc + seconds * 1000,
  };
}

test('游客迁移：10 条入库 + 成就评估一次；重放零副作用', async () => {
  const userId = await makeUser();
  const batch = Array.from({ length: 10 }, () => payload(uid()));
  const first = await migrateGuestSessions(userId, batch);
  assert.equal(first.migrated, 10);
  assert.equal(first.skipped, 0);
  assert.ok(first.grants.includes('first_focus'));

  const grants = await listAchievementsForUser(userId);
  const earned = grants.filter((def) => def.grantedAt);
  assert.equal(earned.length, 1); // 10 条 600s = 100 分钟：只有 first_focus
  const items = await listRoomItemsForUser(userId);
  assert.deepEqual(items.map((item) => item.item_id), ['bookmark']);

  // 重放同一批：全部跳过，无新发放
  const replay = await migrateGuestSessions(userId, batch);
  assert.equal(replay.migrated, 0);
  assert.equal(replay.skipped, 10);
  assert.deepEqual(replay.grants, []);
  const grantRows = await database.prepare(
    'SELECT count(*) AS n FROM achievement_grants WHERE user_id = ?',
  ).get(userId) as { n: number };
  assert.equal(grantRows.n, 1);
});

test('迁移与在线会话 clientRequestId 撞 → 跳过；非法条目跳过不炸', async () => {
  const userId = await makeUser();
  const { createSession } = await import('../src/features/focus/data/focus-repository.ts');
  const session = await createSession({ userId, activity: 'reading', plannedSeconds: 900, clientRequestId: uid(), startedAt: Date.now() });
  const batch = [
    payload(session.client_request_id), // 在线会话同 id → ON CONFLICT 跳过
    payload(uid(), 900),
    { ...payload(uid()), clientRequestId: '' }, // 非法 → 跳过
    { ...payload(uid()), plannedSeconds: 100 }, // 越界 → 跳过
  ];
  const result = await migrateGuestSessions(userId, batch);
  assert.equal(result.migrated, 1);
  assert.equal(result.skipped, 3);
});
