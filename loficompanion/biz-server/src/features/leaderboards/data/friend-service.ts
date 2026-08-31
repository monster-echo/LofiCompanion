import { randomInt, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { ApiError } from '@/lib/http';
import { getDb } from '@/db';
import { profileWithFallback, resolveProfiles } from '@/features/profiles/client';
import { weekStartIso } from '../domain/week';

// 好友域：邀请码制（docs/06 P0-C 决策 2026-08-30 补记）——用户生成 8 位可读码，
// 他人兑码即建立双向好友关系（friendships 两行同事务写入，UNIQUE 幂等兜底）。
// 响应只含昵称/头像/分钟，任务正文永不进入（docs/01 §5.7）。
// biz 搬迁：昵称/头像改经 auth 内部资料端点解析（原为 JOIN users 表），
// 线格式与兜底语义（display_name/username COALESCE → auth 侧 nickname）不变。

// 8 位可读码字母表：去掉易混淆的 I/O/0/1（32 进制 → 熵 40 bit）。
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

export function generateInvitationCode(): string {
  let code = '';
  for (let index = 0; index < 8; index += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

/** 当前用户的邀请码：无则生成；幂等（每人一个有效码，UNIQUE(user_id) 兜底）。 */
export async function getOrCreateInvitationCode(userId: string): Promise<string> {
  const db = getDb();
  const existing = await db.friendInvitation.findUnique({ where: { user_id: userId } });
  if (existing) return existing.code;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generateInvitationCode();
    try {
      await db.friendInvitation.create({
        data: { id: randomUUID(), user_id: userId, code, created_at: nowIso() },
      });
      return code;
    } catch (error) {
      // 并发竞态：码撞 UNIQUE → 换码重试；已有码（user_id UNIQUE）→ 返回既有码。
      if (isUniqueViolation(error, 'user_id')) {
        const row = await db.friendInvitation.findUnique({ where: { user_id: userId } });
        if (row) return row.code;
      }
      if (!isUniqueViolation(error, 'code')) throw error;
    }
  }
  throw new ApiError(500, 'INVITATION_CODE_EXHAUSTED', '邀请码生成失败，请重试', true);
}

export interface FriendProfile {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
}

/** 兑码回执用的好友资料：auth 侧无此用户 → 与 legacy 缺行同义（邀请码无效）。 */
async function loadProfile(userId: string): Promise<FriendProfile> {
  const profiles = await resolveProfiles([userId]);
  const profile = profiles.get(userId);
  if (!profile) throw new ApiError(404, 'FRIEND_INVITATION_INVALID', '邀请码无效');
  return { userId, nickname: profile.nickname, avatarUrl: profile.avatarUrl };
}

export interface AcceptInvitationResult {
  friend: FriendProfile;
  alreadyFriends: boolean;
}

/** 兑码建立双向好友：两行同事务写入；自兑/无效码 → FRIEND_INVITATION_INVALID；
 *  重复兑幂等（alreadyFriends=true，不产生重复行）。 */
export async function acceptInvitation(
  userId: string,
  rawCode: string,
): Promise<AcceptInvitationResult> {
  const code = rawCode.trim().toUpperCase();
  const db = getDb();
  const invitation = await db.friendInvitation.findUnique({ where: { code } });
  if (!invitation) throw new ApiError(404, 'FRIEND_INVITATION_INVALID', '邀请码无效');
  if (invitation.user_id === userId) {
    throw new ApiError(422, 'FRIEND_INVITATION_INVALID', '不能兑换自己的邀请码');
  }
  const friendId = invitation.user_id;
  const existing = await db.friendship.findFirst({
    where: { user_id: userId, friend_id: friendId },
    select: { id: true },
  });
  if (existing) {
    return { friend: await loadProfile(friendId), alreadyFriends: true };
  }
  await getDb().$transaction(async (tx) => {
    // UNIQUE(user_id, friend_id) + skipDuplicates：并发下十次兑码也只有两行。
    const now = nowIso();
    await tx.friendship.createMany({
      data: [
        { id: randomUUID(), user_id: userId, friend_id: friendId, created_at: now },
        { id: randomUUID(), user_id: friendId, friend_id: userId, created_at: now },
      ],
      skipDuplicates: true,
    });
  });
  return { friend: await loadProfile(friendId), alreadyFriends: false };
}

export interface FriendSummary extends FriendProfile {
  /** 本周（周一界 UTC+8）完成专注分钟（completed 会话简单求和；Task 2 结算含每日上限） */
  weekMinutes: number;
}

/** 好友列表：昵称/头像 + 本周分钟（docs/04 §3）。 */
export async function listFriends(userId: string, nowMs: number = Date.now()): Promise<FriendSummary[]> {
  const db = getDb();
  const rows = await db.friendship.findMany({
    where: { user_id: userId },
    select: { friend_id: true, created_at: true },
    orderBy: [{ created_at: 'asc' }, { friend_id: 'asc' }],
  });
  const friendIds = rows.map((row) => row.friend_id);
  const profiles = friendIds.length > 0 ? await resolveProfiles(friendIds) : new Map();
  const weekStart = weekStartIso(nowMs);
  const totals = friendIds.length > 0 ? await db.focusSession.groupBy({
    by: ['user_id'],
    where: {
      status: 'completed',
      ended_at: { gte: weekStart },
      user_id: { in: friendIds },
    },
    _sum: { effective_seconds: true },
  }) : [];
  const secondsByUser = new Map(totals.map((row) => [row.user_id, row._sum.effective_seconds ?? 0]));
  return rows.map((row) => ({
    userId: row.friend_id,
    nickname: profileWithFallback(profiles.get(row.friend_id) ?? null).nickname,
    avatarUrl: profiles.get(row.friend_id)?.avatarUrl ?? null,
    weekMinutes: Math.floor((secondsByUser.get(row.friend_id) ?? 0) / 60),
  }));
}
