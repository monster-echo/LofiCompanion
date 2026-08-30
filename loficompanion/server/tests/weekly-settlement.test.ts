import assert from 'node:assert/strict';
import test, { after } from 'node:test';
const { database } = await import('../src/server/database.ts');
const {
  weekIdOf, weekStartMsOfId, isWeekOver,
} = await import('../src/features/leaderboards/domain/settlement.ts');
const { currentWeekId } = await import('../src/features/leaderboards/data/score-repository.ts');
const { settleGroupWeek, getGroupWeeklyView } = await import('../src/features/leaderboards/data/weekly-settlement.ts');
const { createGroup, joinGroup } = await import('../src/features/leaderboards/data/group-service.ts');

after(async () => database.close());

const uid = () => `ws-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
const DAY_MS = 86_400_000;

async function makeUser(nickname?: string): Promise<string> {
  const id = uid();
  const ts = new Date().toISOString();
  await database.prepare(
    `INSERT INTO users(id, app_id, email, password_hash, username, display_name, created_at, updated_at)
     VALUES (?, 'zhongbei', ?, 'hash', ?, ?, ?, ?)`,
  ).run(id, `${id}@test.local`, id, nickname ?? null, ts, ts);
  return id;
}

/** 直插历史完成会话（fabricated 过去周，绕过创建时钟偏移限制）。 */
async function insertCompletedSession(
  userId: string, startedAtMs: number, endedAtMs: number, effectiveSeconds: number,
): Promise<void> {
  const id = `fs-${uid()}`;
  await database.prepare(
    `INSERT INTO focus_sessions(id, user_id, activity, planned_seconds, status,
       started_at, ended_at, effective_seconds, pauses, client_request_id, created_at, updated_at)
     VALUES (?, ?, 'reading', ?, 'completed', ?, ?, ?, '[]', ?, ?, ?)`,
  ).run(id, userId, Math.min(10800, Math.max(300, effectiveSeconds)),
    new Date(startedAtMs).toISOString(), new Date(endedAtMs).toISOString(),
    effectiveSeconds, `cr-${id}`, new Date(startedAtMs).toISOString(), new Date(endedAtMs).toISOString());
}

async function photoGrants(userId: string) {
  return await database.prepare(
  `SELECT count(*) AS n FROM user_room_items uri
   JOIN room_items ri ON ri.id = uri.room_item_id
   WHERE uri.user_id = ? AND ri.item_id = 'weekly_group_photo'`,
).get(userId) as { n: number };
}

interface EnvelopeRow { id: string; rankings: string; settled_at: string }

const groupSnapshots = (groupId: string, weekId: string) => database.prepare(
  `SELECT id, rankings, settled_at FROM leaderboard_snapshots
   WHERE scope_type = 'group' AND scope_id = ? AND week_id = ? AND rule_version = 2`,
).all(groupId, weekId) as unknown as Promise<EnvelopeRow[]>;

async function makeGroup(goalMinutes: number, memberCount: number) {
  const owner = await makeUser('组长');
  const { group } = await createGroup(owner, '结算小组', goalMinutes);
  const members = [owner];
  for (let index = 0; index < memberCount - 1; index += 1) {
    const member = await makeUser(`组员${index}`);
    await joinGroup(member, group.joinCode);
    members.push(member);
  }
  return { group, members };
}

test('过去周达标结算：每位在组成员恰得一次 weekly_group_photo；快照信封含 goalMet/groupTotalSeconds', async () => {
  const { group, members } = await makeGroup(300, 3); // 目标 300 分钟
  const nowMs = Date.now();
  const prevWeekId = weekIdOf(nowMs - 7 * DAY_MS);
  const weekStart = weekStartMsOfId(prevWeekId)!;
  // 每人 120 分钟（未超单日上限）→ 组合计 360 ≥ 300
  for (const memberId of members) {
    await insertCompletedSession(memberId, weekStart + 7200_000, weekStart + 7200_000 + 7200_000, 7200);
  }
  const outcome = await settleGroupWeek(group.id, prevWeekId, nowMs);
  assert.equal(outcome.isWeekOver, true);
  assert.equal(outcome.snapshotUsed, true);
  assert.equal(outcome.goalMet, true);
  assert.equal(outcome.groupTotalSeconds, 21600); // 360 分钟
  assert.equal(outcome.weeklyGoalMinutes, 300);
  assert.equal(outcome.rankings.length, 3);
  // 每位成员（含 owner）恰一条收藏物
  for (const memberId of members) {
    assert.equal((await photoGrants(memberId)).n, 1);
  }
  // 快照信封固化判定结果
  const snapshots = await groupSnapshots(group.id, prevWeekId);
  assert.equal(snapshots.length, 1);
  const envelope = JSON.parse(snapshots[0].rankings) as {
    goalMet: boolean; groupTotalSeconds: number; rankings: Array<{ minutes: number; rank: number }>;
  };
  assert.equal(envelope.goalMet, true);
  assert.equal(envelope.groupTotalSeconds, 21600);
  assert.deepEqual(envelope.rankings.map((entry) => entry.minutes), [120, 120, 120]);
  assert.deepEqual(envelope.rankings.map((entry) => entry.rank), [1, 2, 3]);
});

test('重放结算：不重复发放、快照不可变（改底层会话亦然）', async () => {
  const { group, members } = await makeGroup(300, 2);
  const prevWeekId = weekIdOf(Date.now() - 7 * DAY_MS);
  const weekStart = weekStartMsOfId(prevWeekId)!;
  for (const memberId of members) {
    await insertCompletedSession(memberId, weekStart + 3600_000, weekStart + 3600_000 + 10800_000, 10800);
  }
  const first = await settleGroupWeek(group.id, prevWeekId);
  assert.equal(first.goalMet, true); // 180 + 180 = 360 ≥ 300
  const before = await groupSnapshots(group.id, prevWeekId);
  assert.equal(before.length, 1);
  // 篡改底层账本后重放：判定与快照冻结不变、不再发放
  await database.prepare(
    "UPDATE focus_sessions SET effective_seconds = 60 WHERE user_id = ? AND status = 'completed'",
  ).run(members[1]);
  const replay = await settleGroupWeek(group.id, prevWeekId);
  assert.equal(replay.goalMet, true);
  assert.equal(replay.groupTotalSeconds, first.groupTotalSeconds);
  assert.deepEqual(replay.rankings, first.rankings);
  for (const memberId of members) {
    assert.equal((await photoGrants(memberId)).n, 1); // 无重复发放
  }
  const after = await groupSnapshots(group.id, prevWeekId);
  assert.equal(after.length, 1);
  assert.equal(after[0].id, before[0].id);
  assert.equal(after[0].settled_at, before[0].settled_at);
  assert.equal(JSON.parse(after[0].rankings).goalMet, true);
});

test('目标未达：不发放收藏物，快照信封 goalMet=false', async () => {
  const { group, members } = await makeGroup(600, 2); // 默认 600 分钟目标
  const prevWeekId = weekIdOf(Date.now() - 7 * DAY_MS);
  const weekStart = weekStartMsOfId(prevWeekId)!;
  await insertCompletedSession(members[0], weekStart + 3600_000, weekStart + 3600_000 + 3600_000, 3600);
  const outcome = await settleGroupWeek(group.id, prevWeekId);
  assert.equal(outcome.snapshotUsed, true);
  assert.equal(outcome.goalMet, false); // 60 < 600
  assert.equal(outcome.groupTotalSeconds, 3600);
  for (const memberId of members) {
    assert.equal((await photoGrants(memberId)).n, 0); // 未达标不发放
  }
  const snapshots = await groupSnapshots(group.id, prevWeekId);
  const envelope = JSON.parse(snapshots[0].rankings) as { goalMet: boolean };
  assert.equal(envelope.goalMet, false);
});

test('本周未结束：live 进度可达标但不发放、不写快照', async () => {
  const { group, members } = await makeGroup(300, 2);
  // 每人今日 180 分钟（达单日上限）→ live 组合计 360 ≥ 300
  const { createSession, settleAndFinishSession } = await import('../src/features/focus/data/focus-repository.ts');
  for (const memberId of members) {
    const startedAt = Date.now() - 10900_000;
    const session = await createSession({
      userId: memberId, activity: 'reading', plannedSeconds: 10800, clientRequestId: uid(), startedAt,
    });
    await settleAndFinishSession(session.id, memberId, {
      pauses: [], completedAt: startedAt + 10800_000, outcome: 'completed',
    }, null);
  }
  const currentWeek = currentWeekId();
  const outcome = await settleGroupWeek(group.id, currentWeek);
  assert.equal(outcome.isWeekOver, false);
  assert.equal(outcome.snapshotUsed, false);
  assert.equal(outcome.goalMet, true); // live 进度已达标
  assert.equal(outcome.groupTotalSeconds, 21600);
  for (const memberId of members) {
    assert.equal((await photoGrants(memberId)).n, 0); // 本周不发放
  }
  const snapshots = await database.prepare(
    'SELECT count(*) AS n FROM leaderboard_snapshots WHERE week_id = ?',
  ).get(currentWeek) as { n: number };
  assert.equal(snapshots.n, 0); // 本周不写快照
});

test('getGroupWeeklyView：目标卡字段齐备；非成员 403；过去周视图用固化快照', async () => {
  const owner = await makeUser('视图组长');
  const member = await makeUser('视图组员');
  const outsider = await makeUser('视图外人');
  const { group } = await createGroup(owner, '视图小组', 300);
  await joinGroup(member, group.joinCode);
  // 本周视图：live 进度
  const currentView = await getGroupWeeklyView(group.id, owner);
  assert.equal(currentView.weekId, currentWeekId());
  assert.equal(currentView.isWeekOver, false);
  assert.equal(currentView.snapshotUsed, false);
  assert.equal(currentView.weeklyGoalMinutes, 300);
  assert.equal(currentView.goalMet, false);
  assert.equal(currentView.groupTotalSeconds, 0);
  assert.equal(currentView.rankings.length, 2);
  await assert.rejects(
    () => getGroupWeeklyView(group.id, outsider),
    (error: { code?: string; status?: number }) =>
      error.code === 'GROUP_FORBIDDEN' && error.status === 403,
  );
  // 过去周视图：结算 + 快照 + 发放后，成员视角读到同一固化结果
  const prevWeekId = weekIdOf(Date.now() - 7 * DAY_MS);
  const weekStart = weekStartMsOfId(prevWeekId)!;
  for (const memberId of [owner, member]) {
    await insertCompletedSession(memberId, weekStart + 7200_000, weekStart + 7200_000 + 10800_000, 10800);
  }
  const pastView = await getGroupWeeklyView(group.id, member, prevWeekId);
  assert.equal(pastView.isWeekOver, true);
  assert.equal(pastView.snapshotUsed, true);
  assert.equal(pastView.goalMet, true); // 360 ≥ 300
  assert.equal(pastView.groupTotalSeconds, 21600);
  assert.equal((await photoGrants(owner)).n, 1);
  assert.equal((await photoGrants(member)).n, 1);
});
