import assert from 'node:assert/strict';
import test, { after } from 'node:test';
const { database } = await import('../src/server/database.ts');
const {
  getOrCreateInvitationCode, acceptInvitation, listFriends,
} = await import('../src/features/leaderboards/data/friend-service.ts');
const {
  createGroup, joinGroup, getGroup,
} = await import('../src/features/leaderboards/data/group-service.ts');
const {
  getOrCreateLeaderboardSettings, updateLeaderboardSettings,
} = await import('../src/features/leaderboards/data/settings-repository.ts');
const { createSession } = await import('../src/features/focus/data/focus-repository.ts');

after(async () => database.close());

const uid = () => `lg-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

async function makeUser(nickname?: string): Promise<string> {
  const id = uid();
  const ts = new Date().toISOString();
  await database.prepare(
    `INSERT INTO users(id, app_id, email, password_hash, username, display_name, created_at, updated_at)
     VALUES (?, 'zhongbei', ?, 'hash', ?, ?, ?, ?)`,
  ).run(id, `${id}@test.local`, id, nickname ?? id, ts, ts);
  return id;
}

test('邀请码：8 位可读码且幂等（同用户重复获取返回同码）', async () => {
  const userId = await makeUser();
  const first = await getOrCreateInvitationCode(userId);
  const second = await getOrCreateInvitationCode(userId);
  assert.equal(first, second);
  assert.match(first, /^[A-HJ-NP-Z2-9]{8}$/);
});

test('兑码建立双向好友：friendships 两行同事务写入', async () => {
  const inviter = await makeUser('阿雪');
  const redeemer = await makeUser('小林');
  const code = await getOrCreateInvitationCode(inviter);
  const { friend, alreadyFriends } = await acceptInvitation(redeemer, code.toLowerCase());
  assert.equal(alreadyFriends, false);
  assert.equal(friend.userId, inviter);
  assert.equal(friend.nickname, '阿雪');
  const rows = await database.prepare(
    `SELECT user_id, friend_id FROM friendships
     WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)`,
  ).all(inviter, redeemer, redeemer, inviter) as Array<{ user_id: string; friend_id: string }>;
  // 双向两行；随机 id 无字典序保证，按集合断言
  assert.deepEqual(
    rows.map((row) => `${row.user_id}->${row.friend_id}`).sort(),
    [`${inviter}->${redeemer}`, `${redeemer}->${inviter}`].sort(),
  );
});

test('自兑与无效码拒绝：FRIEND_INVITATION_INVALID', async () => {
  const userId = await makeUser();
  const code = await getOrCreateInvitationCode(userId);
  await assert.rejects(
    () => acceptInvitation(userId, code),
    (error: { code?: string; status?: number }) =>
      error.code === 'FRIEND_INVITATION_INVALID',
  );
  await assert.rejects(
    () => acceptInvitation(userId, 'ZZZZZZ99'),
    (error: { code?: string }) => error.code === 'FRIEND_INVITATION_INVALID',
  );
  const rows = await database.prepare(
    'SELECT count(*) AS n FROM friendships WHERE user_id = ?',
  ).get(userId) as { n: number };
  assert.equal(rows.n, 0);
});

test('重复兑码幂等：不产生重复好友行', async () => {
  const inviter = await makeUser();
  const redeemer = await makeUser();
  const code = await getOrCreateInvitationCode(inviter);
  const first = await acceptInvitation(redeemer, code);
  const second = await acceptInvitation(redeemer, code);
  assert.equal(first.alreadyFriends, false);
  assert.equal(second.alreadyFriends, true);
  // 反向再兑（inviter 兑 redeemer 的码也幂等）
  const reverseCode = await getOrCreateInvitationCode(redeemer);
  const reverse = await acceptInvitation(inviter, reverseCode);
  assert.equal(reverse.alreadyFriends, true);
  const rows = await database.prepare(
    'SELECT count(*) AS n FROM friendships WHERE user_id IN (?, ?) AND friend_id IN (?, ?)',
  ).get(inviter, redeemer, inviter, redeemer) as { n: number };
  assert.equal(rows.n, 2);
});

test('好友列表：返回昵称/头像 + 本周完成分钟', async () => {
  const inviter = await makeUser();
  const friend = await makeUser('夜读人');
  const code = await getOrCreateInvitationCode(inviter);
  await acceptInvitation(friend, code);
  // 好友完成一节 10 分钟专注 → 本周分钟 ≥ 10
  const session = await createSession({
    userId: friend, activity: 'reading', plannedSeconds: 1500,
    clientRequestId: uid(), startedAt: Date.now() - 1500_000,
  });
  const { settleAndFinishSession } = await import('../src/features/focus/data/focus-repository.ts');
  await settleAndFinishSession(session.id, friend, {
    pauses: [], completedAt: Date.parse(session.started_at) + 600_000, outcome: 'completed',
  }, null);
  const friends = await listFriends(inviter);
  assert.equal(friends.length, 1);
  assert.equal(friends[0].userId, friend);
  assert.equal(friends[0].nickname, '夜读人');
  assert.ok(friends[0].weekMinutes >= 10);
});

test('建组：owner 自动入组且角色 owner', async () => {
  const owner = await makeUser();
  const { group } = await createGroup(owner, '雨夜自习室', 420);
  assert.equal(group.ownerUserId, owner);
  assert.equal(group.weeklyGoalMinutes, 420);
  assert.match(group.joinCode, /^[A-HJ-NP-Z2-9]{8}$/);
  const detail = await getGroup(group.id, owner);
  assert.equal(detail.members.length, 1);
  assert.equal(detail.members[0].userId, owner);
  assert.equal(detail.members[0].role, 'owner');
});

test('入组幂等：重复加入返回既有成员身份', async () => {
  const owner = await makeUser();
  const member = await makeUser();
  const { group } = await createGroup(owner, '晨读小队');
  const first = await joinGroup(member, group.joinCode);
  const second = await joinGroup(member, group.joinCode.toUpperCase());
  assert.equal(first.alreadyMember, false);
  assert.equal(second.alreadyMember, true);
  assert.equal(second.group.id, group.id);
  const detail = await getGroup(group.id, member);
  assert.equal(detail.members.length, 2);
  const roles = new Map(detail.members.map((m) => [m.userId, m.role]));
  assert.equal(roles.get(owner), 'owner');
  assert.equal(roles.get(member), 'member');
});

test('在线专注人数：活跃会话成员计入 onlineCount', async () => {
  const owner = await makeUser();
  const member = await makeUser();
  const outsider = await makeUser();
  const { group } = await createGroup(owner, '晚间共学');
  await joinGroup(member, group.joinCode);
  assert.equal((await getGroup(group.id, owner)).onlineCount, 0);
  // member 开启一节活跃会话 → onlineCount = 1（非成员会话不计入）
  await createSession({
    userId: member, activity: 'homework', plannedSeconds: 1500,
    clientRequestId: uid(), startedAt: Date.now(),
  });
  await createSession({
    userId: outsider, activity: 'homework', plannedSeconds: 1500,
    clientRequestId: uid(), startedAt: Date.now(),
  });
  const detail = await getGroup(group.id, owner);
  assert.equal(detail.onlineCount, 1);
  assert.ok(detail.weekTotalMinutes >= 0);
});

test('非成员查询组详情：403 GROUP_FORBIDDEN', async () => {
  const owner = await makeUser();
  const outsider = await makeUser();
  const { group } = await createGroup(owner, '私享小组');
  await assert.rejects(
    () => getGroup(group.id, outsider),
    (error: { code?: string; status?: number }) =>
      error.code === 'GROUP_FORBIDDEN' && error.status === 403,
  );
  await assert.rejects(
    () => getGroup('group-not-exists', outsider),
    (error: { code?: string; status?: number }) =>
      error.code === 'GROUP_NOT_FOUND' && error.status === 404,
  );
});

test('榜单隐私设置：默认公开未退出；PATCH 部分更新', async () => {
  const userId = await makeUser();
  const defaults = await getOrCreateLeaderboardSettings(userId);
  assert.equal(defaults.publicDisplay, true);
  assert.equal(defaults.optedOut, false);
  const updated = await updateLeaderboardSettings(userId, { optedOut: true });
  assert.equal(updated.optedOut, true);
  assert.equal(updated.publicDisplay, true); // 未指定字段保持不变
  const again = await updateLeaderboardSettings(userId, { publicDisplay: false });
  assert.equal(again.optedOut, true);
  assert.equal(again.publicDisplay, false);
  const persisted = await getOrCreateLeaderboardSettings(userId);
  assert.deepEqual(persisted, again);
});
