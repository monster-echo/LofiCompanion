import { randomInt, randomUUID } from 'node:crypto';
import { database, nowIso, runTransaction } from '@/server/database';
import { ApiError } from '@/server/http';
import { weekStartIso } from '../domain/week';

// 私密自习小组（docs/01 §5.7、docs/04 §3）：加入码制建组/入组，owner 自动入组；
// 在线专注人数 = 有活跃（active/paused）会话的成员计数；共同目标 = 周目标分钟。
// 响应只含昵称/头像/分钟，任务正文永不进入。

// 与好友邀请码同一可读码字母表（去 I/O/0/1）。
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const PG_UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const candidate = error as { code?: string; constraint?: string };
  return candidate.code === PG_UNIQUE_VIOLATION
    && (constraint === undefined || candidate.constraint === constraint);
}

function generateJoinCode(): string {
  let code = '';
  for (let index = 0; index < 8; index += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

export interface GroupRow {
  id: string;
  name: string;
  owner_user_id: string;
  join_code: string;
  weekly_goal_minutes: number;
  created_at: string;
}

export interface GroupSummary {
  id: string;
  name: string;
  ownerUserId: string;
  joinCode: string;
  weeklyGoalMinutes: number;
  createdAt: string;
}

export interface GroupMember {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  role: 'owner' | 'member';
  joinedAt: string;
}

export interface GroupDetail {
  group: GroupSummary;
  members: GroupMember[];
  /** 本周组贡献分钟（completed 会话求和；每日上限结算归 Task 2/3） */
  weekTotalMinutes: number;
  /** 在线专注人数 = 有活跃会话的成员计数 */
  onlineCount: number;
}

function toSummary(row: GroupRow): GroupSummary {
  return {
    id: row.id,
    name: row.name,
    ownerUserId: row.owner_user_id,
    joinCode: row.join_code,
    weeklyGoalMinutes: row.weekly_goal_minutes,
    createdAt: row.created_at,
  };
}

async function getGroupRow(groupId: string): Promise<GroupRow> {
  const row = await database.prepare(
    'SELECT * FROM study_groups WHERE id = ?',
  ).get(groupId) as GroupRow | undefined;
  if (!row) throw new ApiError(404, 'GROUP_NOT_FOUND', '小组不存在');
  return row;
}

/** 组榜等跨域读取的授权入口：组不存在 → 404；请求者非成员 → 403 GROUP_FORBIDDEN。 */
export async function assertGroupMember(groupId: string, userId: string): Promise<void> {
  await getGroupRow(groupId);
  const membership = await database.prepare(
    'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?',
  ).get(groupId, userId);
  if (!membership) throw new ApiError(403, 'GROUP_FORBIDDEN', '仅小组成员可查看该小组');
}

/** 全体成员 id（建组必有 owner，非空）。 */
export async function getGroupMemberIds(groupId: string): Promise<string[]> {
  const rows = await database.prepare(
    'SELECT user_id FROM group_members WHERE group_id = ? ORDER BY joined_at, user_id',
  ).all(groupId) as Array<{ user_id: string }>;
  return rows.map((row) => row.user_id);
}

/** 建组：owner 自动入组（role='owner'），同事务写入；join_code 撞 UNIQUE 换码重试。 */
export async function createGroup(
  userId: string,
  name: string,
  weeklyGoalMinutes = 600,
): Promise<{ group: GroupSummary; alreadyMember: false }> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const joinCode = generateJoinCode();
    try {
      const group = await runTransaction(async () => {
        const groupId = randomUUID();
        const now = nowIso();
        await database.prepare(
          `INSERT INTO study_groups(id, name, owner_user_id, join_code, weekly_goal_minutes, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(groupId, name, userId, joinCode, weeklyGoalMinutes, now);
        await database.prepare(
          `INSERT INTO group_members(group_id, user_id, role, joined_at)
           VALUES (?, ?, 'owner', ?)`,
        ).run(groupId, userId, now);
        return await getGroupRow(groupId);
      });
      return { group: toSummary(group), alreadyMember: false };
    } catch (error) {
      if (!isUniqueViolation(error, 'study_groups_join_code_key')) throw error;
    }
  }
  throw new ApiError(500, 'JOIN_CODE_EXHAUSTED', '加入码生成失败，请重试', true);
}

export interface JoinGroupResult {
  group: GroupSummary;
  alreadyMember: boolean;
}

/** 入组：幂等——已是成员返回既有身份（alreadyMember=true），不产生重复行。 */
export async function joinGroup(userId: string, rawCode: string): Promise<JoinGroupResult> {
  const code = rawCode.trim().toUpperCase();
  const group = await database.prepare(
    'SELECT * FROM study_groups WHERE join_code = ?',
  ).get(code) as GroupRow | undefined;
  if (!group) throw new ApiError(404, 'GROUP_NOT_FOUND', '小组不存在或加入码无效');
  const existing = await database.prepare(
    'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?',
  ).get(group.id, userId) as { role: 'owner' | 'member' } | undefined;
  if (existing) {
    return { group: toSummary(group), alreadyMember: true };
  }
  try {
    await database.prepare(
      `INSERT INTO group_members(group_id, user_id, role, joined_at)
       VALUES (?, ?, 'member', ?)`,
    ).run(group.id, userId, nowIso());
  } catch (error) {
    // 并发入组竞态：UNIQUE(group_id, user_id) 兜底 → 视为幂等成功。
    if (!isUniqueViolation(error, 'group_members_group_id_user_id_key')) throw error;
  }
  return { group: toSummary(group), alreadyMember: false };
}

/** 组详情：成员（含角色）+ 周目标 + 本周组总分钟 + 在线专注人数。
 *  授权在查询层：非成员请求者 → 403 GROUP_FORBIDDEN。 */
export async function getGroup(groupId: string, requesterId: string): Promise<GroupDetail> {
  const group = await getGroupRow(groupId);
  const membership = await database.prepare(
    'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?',
  ).get(groupId, requesterId);
  if (!membership) throw new ApiError(403, 'GROUP_FORBIDDEN', '仅小组成员可查看组详情');
  const members = await database.prepare(
    `SELECT gm.user_id, gm.role, gm.joined_at,
            COALESCE(NULLIF(u.display_name, ''), u.username) AS nickname, u.avatar_url
     FROM group_members gm
     JOIN users u ON u.id = gm.user_id
     WHERE gm.group_id = ?
     ORDER BY gm.joined_at, gm.user_id`,
  ).all(groupId) as Array<{
    user_id: string; role: 'owner' | 'member'; joined_at: string;
    nickname: string; avatar_url: string | null;
  }>;
  const weekStart = weekStartIso();
  const totals = await database.prepare(
    `SELECT COALESCE(SUM(fs.effective_seconds), 0) AS seconds
     FROM focus_sessions fs
     WHERE fs.status = 'completed' AND fs.ended_at >= ?
       AND fs.user_id IN (SELECT user_id FROM group_members WHERE group_id = ?)`,
  ).get(weekStart, groupId) as { seconds: number };
  const online = await database.prepare(
    `SELECT count(*) AS n FROM group_members gm
     WHERE gm.group_id = ?
       AND EXISTS (
         SELECT 1 FROM focus_sessions fs
         WHERE fs.user_id = gm.user_id AND fs.status IN ('active', 'paused')
       )`,
  ).get(groupId) as { n: number };
  return {
    group: toSummary(group),
    members: members.map((row) => ({
      userId: row.user_id,
      nickname: row.nickname,
      avatarUrl: row.avatar_url,
      role: row.role,
      joinedAt: row.joined_at,
    })),
    weekTotalMinutes: Math.floor(Number(totals.seconds) / 60),
    onlineCount: Number(online.n),
  };
}
