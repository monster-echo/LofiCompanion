import assert from 'node:assert/strict';
import test, { after } from 'node:test';
const { database, nowIso } = await import('../src/server/database.ts');
const { createSession, settleAndFinishSession } = await import('../src/features/focus/data/focus-repository.ts');
const {
  evaluateGrants, grantNewlyEarnedForSession, listAchievementsForUser, listRoomItemsForUser, ACHIEVEMENT_DEFS,
} = await import('../src/features/achievements/service.ts');

after(async () => database.close());

const uid = () => `au-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

async function makeUser(): Promise<string> {
  const id = uid();
  const ts = new Date().toISOString();
  await database.prepare(
    `INSERT INTO users(id, app_id, email, password_hash, username, created_at, updated_at)
     VALUES (?, 'zhongbei', ?, 'hash', ?, ?, ?)`,
  ).run(id, `${id}@test.local`, id, ts, ts);
  return id;
}

test('成就定义目录：四规则 v1，奖励映射正确', () => {
  assert.equal(ACHIEVEMENT_DEFS.length, 4);
  const rewards = Object.fromEntries(ACHIEVEMENT_DEFS.map((def) => [def.ruleKey, def.rewardItemId]));
  assert.deepEqual(rewards, {
    first_focus: 'bookmark', streak_7: 'lamp', rainy_10h: 'plant', sessions_100: 'group_photo',
  });
});

test('evaluateGrants：阈值边界与连续日判定（UTC+8）', () => {
  const row = (seconds: number, endedUtcMs: number) => ({ effective_seconds: seconds, ended_at: new Date(endedUtcMs).toISOString() });
  // 空历史不发
  assert.deepEqual(evaluateGrants([], []), []);
  // 首轮即发 first_focus
  assert.ok(evaluateGrants([row(600, Date.now())], []).includes('first_focus'));
  // 10h 边界：35999s 不发，36000s 发
  assert.ok(!evaluateGrants([row(35999, Date.now())], []).includes('rainy_10h'));
  assert.ok(evaluateGrants([row(36000, Date.now())], []).includes('rainy_10h'));
  // 连续 7 天（上海日界）：7 个连续 UTC+8 自然日发 streak_7，6 天不发
  const baseDay = Date.UTC(2026, 7, 20, 10, 0, 0); // 上海 18:00
  const week = Array.from({ length: 7 }, (_, i) => row(600, baseDay + i * 86_400_000));
  assert.ok(evaluateGrants(week, []).includes('streak_7'));
  assert.ok(!evaluateGrants(week.slice(0, 6), []).includes('streak_7'));
  // 断连重置：前 7 天 + 跳一天 + 1 天 → 最长连续 7 → 仍发（累计口径看最长段）
  assert.ok(evaluateGrants([...week, row(600, baseDay + 9 * 86_400_000)], []).includes('streak_7'));
  // alreadyGranted 过滤
  assert.deepEqual(evaluateGrants(week, ['first_focus', 'streak_7', 'rainy_10h', 'sessions_100']), []);
});

test('P0-B 核心验收：完成重放十次只发放一次成就，奖励入房间', async () => {
  const userId = await makeUser();
  const session = await createSession({ userId, activity: 'homework', plannedSeconds: 1500, clientRequestId: uid(), startedAt: Date.now() - 1500_000 });
  const completedAt = Date.parse(session.started_at) + 1500_000;
  let grantsAfterFirst: string[] | null = null;
  for (let i = 0; i < 10; i++) {
    const { grants } = await settleAndFinishSession(
      session.id, userId, { pauses: [], completedAt, outcome: 'completed' }, `idem-ach-${session.id}`,
    );
    if (i === 0) grantsAfterFirst = grants;
    else assert.deepEqual(grants, grantsAfterFirst); // 重放返回首次响应体（发放不重复）
  }
  assert.deepEqual(grantsAfterFirst, ['first_focus']);
  const grants = await database.prepare(
    'SELECT count(*) AS n FROM achievement_grants WHERE user_id = ? AND rule_key = ?',
  ).get(userId, 'first_focus') as { n: number };
  assert.equal(grants.n, 1);
  const items = await listRoomItemsForUser(userId);
  assert.deepEqual(items.map((item) => item.item_id), ['bookmark']);
});

test('达成/房间查询：defs + 发放状态；房间含来源规则', async () => {
  const userId = await makeUser();
  const session = await createSession({ userId, activity: 'reading', plannedSeconds: 600, clientRequestId: uid(), startedAt: Date.now() - 600_000 });
  await settleAndFinishSession(session.id, userId, { pauses: [], completedAt: Date.now(), outcome: 'completed' }, null);
  const achievements = await listAchievementsForUser(userId);
  assert.equal(achievements.length, 4);
  const first = achievements.find((def) => def.ruleKey === 'first_focus')!;
  assert.ok(first.grantedAt);
  const items = await listRoomItemsForUser(userId);
  assert.equal(items[0]?.source_rule_key, 'first_focus');
});

test('grantNewlyEarnedForSession 直调幂等：二次调用零新增', async () => {
  const userId = await makeUser();
  const session = await createSession({ userId, activity: 'free', plannedSeconds: 600, clientRequestId: uid(), startedAt: Date.now() - 600_000 });
  await settleAndFinishSession(session.id, userId, { pauses: [], completedAt: Date.now(), outcome: 'completed' }, null);
  const second = await grantNewlyEarnedForSession(userId, session.id);
  assert.deepEqual(second, []);
  const grants = await database.prepare(
    'SELECT count(*) AS n FROM achievement_grants WHERE user_id = ?',
  ).get(userId) as { n: number };
  assert.equal(grants.n, 1);
});
