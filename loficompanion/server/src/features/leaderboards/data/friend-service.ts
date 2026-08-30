import { randomInt, randomUUID } from 'node:crypto';
import { database, nowIso, runTransaction } from '@/server/database';
import { ApiError } from '@/server/http';
import { weekStartIso } from '../domain/week';

// 好友域：邀请码制（docs/06 P0-C 决策 2026-08-30 补记）——用户生成 8 位可读码，
// 他人兑码即建立双向好友关系（friendships 两行同事务写入，UNIQUE 幂等兜底）。
// 响应只含昵称/头像/分钟，任务正文永不进入（docs/01 §5.7）。

// 8 位可读码字母表：去掉易混淆的 I/O/0/1（32 进制 → 熵 40 bit）。
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const PG_UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const candidate = error as { code?: string; constraint?: string };
  return candidate.code === PG_UNIQUE_VIOLATION
    && (constraint === undefined || candidate.constraint === constraint);
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
  const existing = await database.prepare(
    'SELECT code FROM friend_invitations WHERE user_id = ?',
  ).get(userId) as { code: string } | undefined;
  if (existing) return existing.code;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generateInvitationCode();
    try {
      await database.prepare(
        `INSERT INTO friend_invitations(id, user_id, code, created_at)
         VALUES (?, ?, ?, ?)`,
      ).run(randomUUID(), userId, code, nowIso());
      return code;
    } catch (error) {
      // 并发竞态：码撞 UNIQUE → 换码重试；已有码（user_id UNIQUE）→ 返回既有码。
      if (isUniqueViolation(error, 'friend_invitations_user_id_key')) {
        const row = await database.prepare(
          'SELECT code FROM friend_invitations WHERE user_id = ?',
        ).get(userId) as { code: string } | undefined;
        if (row) return row.code;
      }
      if (!isUniqueViolation(error, 'friend_invitations_code_key')) throw error;
    }
  }
  throw new ApiError(500, 'INVITATION_CODE_EXHAUSTED', '邀请码生成失败，请重试', true);
}

export interface FriendProfile {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
}

async function loadProfile(userId: string): Promise<FriendProfile> {
  const row = await database.prepare(
    `SELECT id, COALESCE(NULLIF(display_name, ''), username) AS nickname, avatar_url
     FROM users WHERE id = ?`,
  ).get(userId) as { id: string; nickname: string; avatar_url: string | null } | undefined;
  if (!row) throw new ApiError(404, 'FRIEND_INVITATION_INVALID', '邀请码无效');
  return { userId: row.id, nickname: row.nickname, avatarUrl: row.avatar_url };
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
  const invitation = await database.prepare(
    'SELECT user_id FROM friend_invitations WHERE code = ?',
  ).get(code) as { user_id: string } | undefined;
  if (!invitation) throw new ApiError(404, 'FRIEND_INVITATION_INVALID', '邀请码无效');
  if (invitation.user_id === userId) {
    throw new ApiError(422, 'FRIEND_INVITATION_INVALID', '不能兑换自己的邀请码');
  }
  const friendId = invitation.user_id;
  const existing = await database.prepare(
    'SELECT id FROM friendships WHERE user_id = ? AND friend_id = ?',
  ).get(userId, friendId);
  if (existing) {
    return { friend: await loadProfile(friendId), alreadyFriends: true };
  }
  await runTransaction(async () => {
    // UNIQUE(user_id, friend_id) + ON CONFLICT：并发下十次兑码也只有两行。
    for (const pair of [[userId, friendId], [friendId, userId]] as const) {
      await database.prepare(
        `INSERT INTO friendships(id, user_id, friend_id, created_at)
         VALUES (?, ?, ?, ?) ON CONFLICT (user_id, friend_id) DO NOTHING`,
      ).run(randomUUID(), pair[0], pair[1], nowIso());
    }
  });
  return { friend: await loadProfile(friendId), alreadyFriends: false };
}

export interface FriendSummary extends FriendProfile {
  /** 本周（周一界 UTC+8）完成专注分钟（completed 会话简单求和；Task 2 结算含每日上限） */
  weekMinutes: number;
}

/** 好友列表：昵称/头像 + 本周分钟（docs/04 §3）。 */
export async function listFriends(userId: string, nowMs: number = Date.now()): Promise<FriendSummary[]> {
  const rows = await database.prepare(
    `SELECT u.id, COALESCE(NULLIF(u.display_name, ''), u.username) AS nickname, u.avatar_url
     FROM friendships f
     JOIN users u ON u.id = f.friend_id
     WHERE f.user_id = ?
     ORDER BY f.created_at, u.id`,
  ).all(userId) as Array<{ id: string; nickname: string; avatar_url: string | null }>;
  const weekStart = weekStartIso(nowMs);
  const totals = await database.prepare(
    `SELECT fs.user_id, COALESCE(SUM(fs.effective_seconds), 0) AS seconds
     FROM focus_sessions fs
     WHERE fs.status = 'completed' AND fs.ended_at >= ?
       AND fs.user_id IN (SELECT friend_id FROM friendships WHERE user_id = ?)
     GROUP BY fs.user_id`,
  ).all(weekStart, userId) as Array<{ user_id: string; seconds: number }>;
  const secondsByUser = new Map(totals.map((row) => [row.user_id, Number(row.seconds)]));
  return rows.map((row) => ({
    userId: row.id,
    nickname: row.nickname,
    avatarUrl: row.avatar_url,
    weekMinutes: Math.floor((secondsByUser.get(row.id) ?? 0) / 60),
  }));
}
