import { randomInt, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { ApiError } from '@/lib/http';
import { getDb } from '@/db';
import { profileWithFallback, resolveProfiles } from '@/features/profiles/client';
import { applyDailyCap, weekIdOf, weekStartMsOfId } from '../domain/settlement';

// 私密自习小组（docs/01 §5.7、docs/04 §3）：加入码制建组/入组，owner 自动入组；
// 在线专注人数 = 有活跃（active/paused）会话的成员计数；共同目标 = 周目标分钟。
// 响应只含昵称/头像/分钟，任务正文永不进入。
// biz 搬迁：昵称/头像改经 auth 内部资料端点解析（原为 JOIN users 表），
// 线格式不变；缺席 id 兜底昵称「同学」。

// 与好友邀请码同一可读码字母表（去 I/O/0/1）。
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Prisma 唯一约束冲突（对应 legacy PG 23505），field 为约束字段名之一。 */
function isUniqueViolation(error: unknown, field?: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }
  if (field === undefined) return true;
  const target = error.meta?.target;
  return Array.isArray(target) && (target as string[]).includes(field);
}

function nowIso(): string {
  return new Date().toISOString();
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
  /** 所属 ISO 周（YYYY-Www） */
  weekId: string;
  /** 本周组贡献分钟：与榜单同口径（每成员每日 180 分钟裁剪后求和） */
  thisWeekMinutes: number;
  /** 本周是否已达周目标（thisWeekMinutes ≥ weekly_goal_minutes） */
  goalMet: boolean;
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
  const row = await getDb().studyGroup.findUnique({ where: { id: groupId } });
  if (!row) throw new ApiError(404, 'GROUP_NOT_FOUND', '小组不存在');
  return row as GroupRow;
}

/** 组榜等跨域读取的授权入口：组不存在 → 404；请求者非成员 → 403 GROUP_FORBIDDEN。 */
export async function assertGroupMember(groupId: string, userId: string): Promise<void> {
  await getGroupRow(groupId);
  const membership = await getDb().groupMember.findUnique({
    where: { group_id_user_id: { group_id: groupId, user_id: userId } },
    select: { role: true },
  });
  if (!membership) throw new ApiError(403, 'GROUP_FORBIDDEN', '仅小组成员可查看该小组');
}

/** 全体成员 id（建组必有 owner，非空）。 */
export async function getGroupMemberIds(groupId: string): Promise<string[]> {
  const rows = await getDb().groupMember.findMany({
    where: { group_id: groupId },
    select: { user_id: true },
    orderBy: [{ joined_at: 'asc' }, { user_id: 'asc' }],
  });
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
      const group = await getDb().$transaction(async (tx) => {
        const groupId = randomUUID();
        const now = nowIso();
        await tx.studyGroup.create({
          data: {
            id: groupId,
            name,
            owner_user_id: userId,
            join_code: joinCode,
            weekly_goal_minutes: weeklyGoalMinutes,
            created_at: now,
          },
        });
        await tx.groupMember.create({
          data: { group_id: groupId, user_id: userId, role: 'owner', joined_at: now },
        });
        return await tx.studyGroup.findUnique({ where: { id: groupId } }) as GroupRow;
      });
      return { group: toSummary(group), alreadyMember: false };
    } catch (error) {
      if (!isUniqueViolation(error, 'join_code')) throw error;
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
  const db = getDb();
  const group = await db.studyGroup.findUnique({ where: { join_code: code } });
  if (!group) throw new ApiError(404, 'GROUP_NOT_FOUND', '小组不存在或加入码无效');
  const existing = await db.groupMember.findUnique({
    where: { group_id_user_id: { group_id: group.id, user_id: userId } },
    select: { role: true },
  });
  if (existing) {
    return { group: toSummary(group as GroupRow), alreadyMember: true };
  }
  try {
    await db.groupMember.create({
      data: { group_id: group.id, user_id: userId, role: 'member', joined_at: nowIso() },
    });
  } catch (error) {
    // 并发入组竞态：UNIQUE(group_id, user_id) 兜底 → 视为幂等成功。
    if (!isUniqueViolation(error, 'user_id')) throw error;
  }
  return { group: toSummary(group as GroupRow), alreadyMember: false };
}

/** 组详情：成员（含角色）+ 周目标 + 本周组总分钟 + 在线专注人数。
 *  授权在查询层：非成员请求者 → 403 GROUP_FORBIDDEN。 */
export async function getGroup(groupId: string, requesterId: string): Promise<GroupDetail> {
  const db = getDb();
  const group = await getGroupRow(groupId);
  const membership = await db.groupMember.findUnique({
    where: { group_id_user_id: { group_id: groupId, user_id: requesterId } },
    select: { role: true },
  });
  if (!membership) throw new ApiError(403, 'GROUP_FORBIDDEN', '仅小组成员可查看组详情');
  const memberRows = await db.groupMember.findMany({
    where: { group_id: groupId },
    orderBy: [{ joined_at: 'asc' }, { user_id: 'asc' }],
  });
  const profiles = await resolveProfiles(memberRows.map((row) => row.user_id));
  // 本周进度：与榜单同口径——按成员分别做每日 180 分钟裁剪后求和（可重建）。
  const weekId = weekIdOf(Date.now());
  const weekStartMs = weekStartMsOfId(weekId)!;
  const sessionRows = await db.focusSession.findMany({
    where: {
      status: 'completed',
      ended_at: {
        gte: new Date(weekStartMs).toISOString(),
        lt: new Date(weekStartMs + 7 * 86_400_000).toISOString(),
      },
      user_id: { in: memberRows.map((row) => row.user_id) },
    },
    select: { user_id: true, effective_seconds: true, ended_at: true },
  });
  const sessionsByUser = new Map<string, Array<{ effective_seconds: number; ended_at: string | null }>>();
  for (const row of sessionRows) {
    const list = sessionsByUser.get(row.user_id) ?? [];
    list.push({ effective_seconds: row.effective_seconds, ended_at: row.ended_at });
    sessionsByUser.set(row.user_id, list);
  }
  let cappedSeconds = 0;
  for (const sessions of sessionsByUser.values()) {
    cappedSeconds += applyDailyCap(sessions).totalSeconds;
  }
  const goalMet = cappedSeconds >= group.weekly_goal_minutes * 60;
  // 在线专注人数：有活跃（active/paused）会话的成员去重计数（legacy EXISTS 语义）。
  const activeMembers = await db.focusSession.findMany({
    where: { user_id: { in: memberRows.map((row) => row.user_id) }, status: { in: ['active', 'paused'] } },
    select: { user_id: true },
    distinct: ['user_id'],
  });
  return {
    group: toSummary(group),
    members: memberRows.map((row) => {
      const profile = profiles.get(row.user_id) ?? null;
      return {
        userId: row.user_id,
        nickname: profileWithFallback(profile).nickname,
        avatarUrl: profile?.avatarUrl ?? null,
        role: row.role as 'owner' | 'member',
        joinedAt: row.joined_at,
      };
    }),
    weekId,
    thisWeekMinutes: Math.floor(cappedSeconds / 60),
    goalMet,
    onlineCount: activeMembers.length,
  };
}
