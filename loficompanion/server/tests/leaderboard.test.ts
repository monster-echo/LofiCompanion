import assert from 'node:assert/strict';
import test, { after } from 'node:test';
const { database } = await import('../src/server/database.ts');
const {
  weekIdOf, weekStartMsOfId, isWeekOver, applyDailyCap, weekStartIso,
} = await import('../src/features/leaderboards/domain/settlement.ts');
const {
  settleUserWeek, friendsLeaderboard, groupLeaderboard, currentWeekId,
} = await import('../src/features/leaderboards/data/score-repository.ts');
const { createGroup, joinGroup } = await import('../src/features/leaderboards/data/group-service.ts');
const { getOrCreateInvitationCode, acceptInvitation } = await import('../src/features/leaderboards/data/friend-service.ts');
const { updateLeaderboardSettings } = await import('../src/features/leaderboards/data/settings-repository.ts');
const {
  createSession, settleAndFinishSession,
} = await import('../src/features/focus/data/focus-repository.ts');

after(async () => database.close());

const uid = () => `lb-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
const DAY_MS = 86_400_000;

// 榜单响应条目白名单：任务正文/活动字段永不进入（docs/01 §5.7、docs/03 §9）
const RANKING_ALLOWED_KEYS = new Set(['userId', 'nickname', 'avatarUrl', 'minutes', 'sessionCount', 'rank', 'youOptedOut']);

function assertNoTaskContent(rankings: ReadonlyArray<object>, selfUserId?: string) {
  for (const entry of rankings) {
    const record = entry as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      assert.ok(RANKING_ALLOWED_KEYS.has(key), `榜单出现非法字段: ${key}`);
    }
    if (record.userId !== selfUserId) {
      assert.ok(!('youOptedOut' in record), 'youOptedOut 只允许出现在本人行');
    }
  }
}

async function makeUser(nickname?: string, avatarUrl?: string): Promise<string> {
  const id = uid();
  const ts = new Date().toISOString();
  await database.prepare(
    `INSERT INTO users(id, app_id, email, password_hash, username, display_name, avatar_url, created_at, updated_at)
     VALUES (?, 'zhongbei', ?, 'hash', ?, ?, ?, ?, ?)`,
  ).run(id, `${id}@test.local`, id, nickname ?? null, avatarUrl ?? null, ts, ts);
  return id;
}

/** 今日真实完成会话（走 focus 结算，受 planned_seconds 300–10800 约束）。 */
async function completeTodaySession(userId: string, effectiveSeconds: number): Promise<void> {
  const startedAt = Date.now() - (effectiveSeconds + 60) * 1000;
  const session = await createSession({
    userId, activity: 'reading',
    plannedSeconds: Math.max(300, Math.min(10800, effectiveSeconds)),
    clientRequestId: uid(), startedAt,
  });
  await settleAndFinishSession(session.id, userId, {
    pauses: [], completedAt: startedAt + effectiveSeconds * 1000, outcome: 'completed',
  }, null);
}

/** 直插历史完成会话（ fabricated 过去周，绕过创建时钟偏移限制）。 */
async function insertCompletedSession(
  userId: string, startedAtMs: number, endedAtMs: number, effectiveSeconds: number,
): Promise<string> {
  const id = `fs-${uid()}`;
  await database.prepare(
    `INSERT INTO focus_sessions(id, user_id, activity, planned_seconds, status,
       started_at, ended_at, effective_seconds, pauses, client_request_id, created_at, updated_at)
     VALUES (?, ?, 'reading', ?, 'completed', ?, ?, ?, '[]', ?, ?, ?)`,
  ).run(id, userId, Math.min(10800, Math.max(300, effectiveSeconds)),
    new Date(startedAtMs).toISOString(), new Date(endedAtMs).toISOString(),
    effectiveSeconds, `cr-${id}`, new Date(startedAtMs).toISOString(), new Date(endedAtMs).toISOString());
  return id;
}

async function makeFriends(viewerId: string, friendIds: ReadonlyArray<string>): Promise<void> {
  const code = await getOrCreateInvitationCode(viewerId);
  for (const friendId of friendIds) await acceptInvitation(friendId, code);
}

test('weekIdOf：周日与次日周一分属两周；UTC+8 日界；weekStartMsOfId 往返一致', () => {
  // 2026-08-30（周日）/ 2026-08-31（周一）——已对照 ISO 周历与边界实现核实
  assert.equal(weekIdOf(Date.parse('2026-08-30T02:00:00Z')), '2026-W35');
  assert.equal(weekIdOf(Date.parse('2026-08-31T02:00:00Z')), '2026-W36');
  // 周日 23:59（UTC+8）仍在 W35；周一 00:00（UTC+8）起为 W36
  assert.equal(weekIdOf(Date.parse('2026-08-30T15:59:00Z')), '2026-W35');
  assert.equal(weekIdOf(Date.parse('2026-08-30T16:00:00Z')), '2026-W36');
  // ISO 年边界交叉核对（2026 年 1 月 1 日为周四：2025-12-29 起即 2026-W01；2026 有 53 周）
  assert.equal(weekIdOf(Date.parse('2025-12-29T00:00:00Z')), '2026-W01');
  assert.equal(weekIdOf(Date.parse('2025-12-28T00:00:00Z')), '2025-W52');
  assert.equal(weekIdOf(Date.parse('2027-01-03T00:00:00Z')), '2026-W53');
  assert.equal(weekIdOf(Date.parse('2027-01-04T00:00:00Z')), '2027-W01');
  // 往返：weekId → 周一时刻 与 weekStartIso 单一周界实现一致
  assert.equal(weekStartMsOfId('2026-W35'), Date.parse(weekStartIso(Date.parse('2026-08-30T02:00:00Z'))));
  assert.equal(weekStartMsOfId('2026-W36'), Date.parse(weekStartIso(Date.parse('2026-08-31T02:00:00Z'))));
  // 周界闸门：W35 于 2026-08-30T16:00Z（下周一 00:00 UTC+8）结束
  assert.equal(isWeekOver('2026-W35', Date.parse('2026-08-30T15:59:59Z')), false);
  assert.equal(isWeekOver('2026-W35', Date.parse('2026-08-30T16:00:00Z')), true);
  // 非法格式
  assert.equal(weekStartMsOfId('2026-W54'), null);
  assert.equal(weekStartMsOfId('not-a-week'), null);
});

test('applyDailyCap：单日 300→180；双日 200+100→300；同日 90+90→180；跨午夜计入结束日', () => {
  const day = (hourUtc: number, minute = 0) => `2026-08-26T${String(hourUtc).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`;
  // 单日 300 分钟 → 180
  assert.deepEqual(
    applyDailyCap([{ effective_seconds: 18000, ended_at: day(2) }]),
    { totalSeconds: 10800, sessionCount: 1 },
  );
  // 两天：200 分钟日被裁到 180 + 100 分钟日不裁 → 280；02:00Z=10:00 UTC+8 当日、20:00Z=次日 04:00 UTC+8
  assert.deepEqual(
    applyDailyCap([
      { effective_seconds: 12000, ended_at: day(2) },
      { effective_seconds: 6000, ended_at: day(20) },
    ]),
    { totalSeconds: 16800, sessionCount: 2 },
  );
  // 两天各 100 分钟 → 200（均未超限）
  assert.deepEqual(
    applyDailyCap([
      { effective_seconds: 6000, ended_at: day(2) },
      { effective_seconds: 6000, ended_at: day(20) },
    ]),
    { totalSeconds: 12000, sessionCount: 2 },
  );
  // 同日 90 + 90 → 180
  assert.deepEqual(
    applyDailyCap([
      { effective_seconds: 5400, ended_at: day(1) },
      { effective_seconds: 5400, ended_at: day(9) }, // 同一 UTC+8 日（UTC 不同日不算）
    ]),
    { totalSeconds: 10800, sessionCount: 2 },
  );
  // 跨午夜会话按 ended_at 落日归属（约定：结束日承担全部额度）：
  // A 180min 结束于 23:00（UTC+8），B 30min 结束于次日 00:10 → 两日各自额度，合计 210min。
  // 若误归同日则 A 日 210min 被裁到 180，总量会是 180min——12600 断言即锁定该语义。
  assert.deepEqual(
    applyDailyCap([
      { effective_seconds: 10800, ended_at: '2026-08-30T15:00:00Z' }, // 08-30 23:00 UTC+8
      { effective_seconds: 1800, ended_at: '2026-08-30T16:10:00Z' }, // 08-31 00:10 UTC+8
    ]),
    { totalSeconds: 12600, sessionCount: 2 },
  );
  // 0 秒会话不计分钟也不计次
  assert.deepEqual(
    applyDailyCap([{ effective_seconds: 0, ended_at: day(2) }]),
    { totalSeconds: 0, sessionCount: 0 },
  );
});

test('settleUserWeek：真实会话每日裁剪（150+120=270 → 180）；重复结算幂等单行', async () => {
  const userId = await makeUser();
  await completeTodaySession(userId, 9000); // 150 分钟
  await completeTodaySession(userId, 7200); // 120 分钟
  const weekId = currentWeekId();
  const row = await settleUserWeek(userId, weekId);
  assert.equal(row.scope_type, 'friends');
  assert.equal(row.scope_id, userId);
  assert.equal(row.week_id, weekId);
  assert.equal(row.rule_version, 2);
  assert.equal(row.effective_seconds, 10800); // 270 → 180 上限
  assert.equal(row.session_count, 2);
  const again = await settleUserWeek(userId, weekId);
  assert.equal(again.effective_seconds, 10800);
  const rows = await database.prepare(
    'SELECT count(*) AS n FROM leaderboard_scores WHERE user_id = ? AND week_id = ? AND scope_type = ?',
  ).get(userId, weekId, 'friends') as { n: number };
  assert.equal(rows.n, 1); // upsert 不产生重复行
});

test('好友榜隐私：退出者消失；隐藏昵称者保留名次；响应无任务正文字段', async () => {
  const viewer = await makeUser('查查', '/avatars/viewer.png');
  const optedOut = await makeUser('小乙');
  const hidden = await makeUser('隐士', '/avatars/hidden.png');
  const normal = await makeUser('小丁', '/avatars/d.png');
  await makeFriends(viewer, [optedOut, hidden, normal]);
  await updateLeaderboardSettings(optedOut, { optedOut: true });
  await updateLeaderboardSettings(hidden, { publicDisplay: false });
  await completeTodaySession(viewer, 1800); // 30 分钟
  await completeTodaySession(normal, 3600); // 60 分钟
  const view = await friendsLeaderboard(viewer, currentWeekId());
  assert.equal(view.isWeekOver, false);
  assert.equal(view.snapshotUsed, false);
  assert.deepEqual(view.rankings.map((entry) => [entry.userId, entry.minutes, entry.rank]), [
    [normal, 60, 1],
    [viewer, 30, 2],
    [hidden, 0, 3], // 无会话仍参与排名
  ]);
  assert.ok(!view.rankings.some((entry) => entry.userId === optedOut)); // 退出者消失
  const hiddenRow = view.rankings.find((entry) => entry.userId === hidden)!;
  assert.equal(hiddenRow.nickname, '已隐藏'); // 关闭公开昵称
  assert.equal(hiddenRow.avatarUrl, null);
  const normalRow = view.rankings.find((entry) => entry.userId === normal)!;
  assert.equal(normalRow.nickname, '小丁');
  assert.equal(normalRow.avatarUrl, '/avatars/d.png');
  assertNoTaskContent(view.rankings);
  assert.ok(view.rankings.every((entry) => !('youOptedOut' in entry)));
});

test('本人退出榜单：自己的行仍在（youOptedOut 提示），他人视角不出现', async () => {
  const viewer = await makeUser('自观');
  const friend = await makeUser('友观');
  await makeFriends(viewer, [friend]);
  await updateLeaderboardSettings(viewer, { optedOut: true });
  const view = await friendsLeaderboard(viewer, currentWeekId());
  const selfRow = view.rankings.find((entry) => entry.userId === viewer);
  assert.ok(selfRow, '本人行必须保留（已退出榜单提示）');
  assert.equal(selfRow?.youOptedOut, true);
  assert.equal(selfRow?.nickname, '自观'); // 自视图仍可见自己昵称
  assertNoTaskContent(view.rankings, viewer);
  // 他人视角：viewer 消失
  const friendView = await friendsLeaderboard(friend, currentWeekId());
  assert.ok(!friendView.rankings.some((entry) => entry.userId === viewer));
  assertNoTaskContent(friendView.rankings, friend);
});

test('不可变快照：过去周首次查询结算并写快照；改会话再查结果不变；当前周不写快照', async () => {
  const viewer = await makeUser('存档人');
  const friend = await makeUser('上周者');
  await makeFriends(viewer, [friend]);
  const nowMs = Date.now();
  const prevWeekId = weekIdOf(nowMs - 7 * DAY_MS);
  assert.equal(isWeekOver(prevWeekId, nowMs), true);
  const weekStart = weekStartMsOfId(prevWeekId)!;
  await insertCompletedSession(viewer, weekStart + 3600_000, weekStart + 3600_000 + 7200_000, 7200);
  await insertCompletedSession(friend, weekStart + 7200_000, weekStart + 7200_000 + 12000_000, 12000); // 200 分钟 → 180
  const first = await friendsLeaderboard(viewer, prevWeekId);
  assert.equal(first.isWeekOver, true);
  assert.equal(first.snapshotUsed, true);
  assert.deepEqual(first.rankings.map((entry) => [entry.userId, entry.minutes, entry.rank]), [
    [friend, 180, 1],
    [viewer, 120, 2],
  ]);
  assertNoTaskContent(first.rankings);
  const snapshots = () => database.prepare(
    `SELECT id, rankings, settled_at FROM leaderboard_snapshots
     WHERE scope_type = ? AND scope_id = ? AND week_id = ? AND rule_version = 2`,
  ).all('friends', viewer, prevWeekId) as Promise<Array<{ id: string; rankings: string; settled_at: string }>>;
  const before = await snapshots();
  assert.equal(before.length, 1);
  // 篡改底层账本后重查：快照不可变，结果不变、不重算、不重写
  await database.prepare(
    "UPDATE focus_sessions SET effective_seconds = 60 WHERE user_id = ? AND status = 'completed'",
  ).run(friend);
  const second = await friendsLeaderboard(viewer, prevWeekId);
  assert.deepEqual(second.rankings, first.rankings);
  const after = await snapshots();
  assert.equal(after.length, 1);
  assert.equal(after[0].id, before[0].id);
  assert.equal(after[0].settled_at, before[0].settled_at);
  assert.deepEqual(JSON.parse(after[0].rankings), first.rankings);
  // 当前周查询：live 结算，不写快照
  const currentWeek = currentWeekId(nowMs);
  const live = await friendsLeaderboard(viewer, currentWeek);
  assert.equal(live.snapshotUsed, false);
  const currentSnapshots = await database.prepare(
    'SELECT count(*) AS n FROM leaderboard_snapshots WHERE week_id = ?',
  ).get(currentWeek) as { n: number };
  assert.equal(currentSnapshots.n, 0);
});

test('组周榜：成员可见按分钟排名；非成员 403 GROUP_FORBIDDEN；无任务正文字段', async () => {
  const owner = await makeUser('组长');
  const member = await makeUser('组员');
  const outsider = await makeUser('外人');
  const { group } = await createGroup(owner, '共学小组');
  await joinGroup(member, group.joinCode);
  await completeTodaySession(member, 2700); // 45 分钟
  const view = await groupLeaderboard(group.id, owner, currentWeekId());
  assert.equal(view.snapshotUsed, false);
  assert.deepEqual(view.rankings.map((entry) => [entry.userId, entry.minutes, entry.rank]), [
    [member, 45, 1],
    [owner, 0, 2],
  ]);
  assertNoTaskContent(view.rankings);
  await assert.rejects(
    () => groupLeaderboard(group.id, outsider, currentWeekId()),
    (error: { code?: string; status?: number }) =>
      error.code === 'GROUP_FORBIDDEN' && error.status === 403,
  );
});
