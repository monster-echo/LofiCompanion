import { randomUUID } from 'node:crypto';
import { database, nowIso } from '@/server/database';
import { ApiError } from '@/server/http';
import {
  applyDailyCap, DAY_MS, isWeekOver, weekIdOf, weekStartMsOfId,
} from '../domain/settlement';
import { getOrCreateLeaderboardSettings } from './settings-repository';

// 榜单结算与查询（docs/03 §9、docs/04 §3，rule_version=2）：
// - 结算：focus_sessions 该周 completed 会话 → applyDailyCap（每日 180 分钟上限）
//   → 原子 upsert leaderboard_scores（ON CONFLICT DO UPDATE）；
// - 授权在查询层：好友圈 = 本人 + 好友；组榜 = 成员；opted_out=1 从他人视图消失；
//   public_display=0 昵称「已隐藏」头像 null 但保留名次（docs/01「关闭公开昵称」）；
// - 周末后首次查询惰性写不可变快照（rankings 只含昵称/头像/分钟/名次，无任务正文）；
//   已有快照直接返回、永不重算。

export const LEADERBOARD_RULE_VERSION = 2;
export const DAILY_CAP_MINUTES = 180;

export type LeaderboardScopeType = 'friends' | 'group';

export interface LeaderboardScoreRow {
  user_id: string;
  scope_type: LeaderboardScopeType;
  scope_id: string;
  week_id: string;
  effective_seconds: number;
  session_count: number;
  rule_version: number;
  updated_at: string;
}

export interface RankingEntry {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  minutes: number;
  sessionCount: number;
  rank: number;
}

export interface LeaderboardView {
  weekId: string;
  isWeekOver: boolean;
  rankings: Array<RankingEntry & { youOptedOut?: true }>;
  snapshotUsed: boolean;
}

/** leaderboard_snapshots.rankings 的统一信封（两种 scope 同构）：组榜附带
 *  goalMet/groupTotalSeconds（周结算判定随不可变快照固化）；好友榜两字段为 null。 */
export interface SnapshotEnvelope {
  rankings: RankingEntry[];
  goalMet: boolean | null;
  groupTotalSeconds: number | null;
}

export function assertWeekId(weekId: string): number {
  const startMs = weekStartMsOfId(weekId);
  if (startMs === null) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'week 格式须为 YYYY-Www');
  }
  return startMs;
}

async function loadWeekSessions(userId: string, weekId: string) {
  const startMs = assertWeekId(weekId);
  return await database.prepare(
    `SELECT effective_seconds, ended_at FROM focus_sessions
     WHERE user_id = ? AND status = 'completed' AND ended_at >= ? AND ended_at < ?
     ORDER BY ended_at`,
  ).all(userId, new Date(startMs).toISOString(), new Date(startMs + 7 * DAY_MS).toISOString()) as Array<{
    effective_seconds: number; ended_at: string;
  }>;
}

async function upsertScore(
  userId: string,
  scopeType: LeaderboardScopeType,
  scopeId: string,
  weekId: string,
  totals: { totalSeconds: number; sessionCount: number },
): Promise<LeaderboardScoreRow> {
  const updatedAt = nowIso();
  // 原子 upsert（docs/03 §9）：重放/重复结算只更新同一行，不产生重复分。
  await database.prepare(
    `INSERT INTO leaderboard_scores(
       user_id, scope_type, scope_id, week_id,
       effective_seconds, session_count, rule_version, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, scope_type, scope_id, week_id, rule_version) DO UPDATE SET
       effective_seconds = excluded.effective_seconds,
       session_count = excluded.session_count,
       updated_at = excluded.updated_at`,
  ).run(userId, scopeType, scopeId, weekId,
    totals.totalSeconds, totals.sessionCount, LEADERBOARD_RULE_VERSION, updatedAt);
  return {
    user_id: userId,
    scope_type: scopeType,
    scope_id: scopeId,
    week_id: weekId,
    effective_seconds: totals.totalSeconds,
    session_count: totals.sessionCount,
    rule_version: LEADERBOARD_RULE_VERSION,
    updated_at: updatedAt,
  };
}

/** 结算单人当前周（好友榜口径：scope_type='friends'，scope_id=本人）。 */
export async function settleUserWeek(userId: string, weekId: string): Promise<LeaderboardScoreRow> {
  const sessions = await loadWeekSessions(userId, weekId);
  return await upsertScore(userId, 'friends', userId, weekId, applyDailyCap(sessions, DAILY_CAP_MINUTES));
}

export async function settleScope(
  scopeType: LeaderboardScopeType,
  scopeId: string,
  userIds: ReadonlyArray<string>,
  weekId: string,
): Promise<LeaderboardScoreRow[]> {
  const rows: LeaderboardScoreRow[] = [];
  for (const userId of userIds) {
    const sessions = await loadWeekSessions(userId, weekId);
    rows.push(await upsertScore(userId, scopeType, scopeId, weekId, applyDailyCap(sessions, DAILY_CAP_MINUTES)));
  }
  return rows;
}

interface ProfileRow {
  id: string;
  nickname: string;
  avatar_url: string | null;
}

interface SettingsRow {
  user_id: string;
  public_display: number;
  opted_out: number;
}

/**
 * 排名组装（唯一出口，供 live 与快照共用）：按有效秒降序（并列按完成数、userId），
 * rank = 序号 + 1。隐私语义：opted_out=1 整行消失；public_display=0 →
 * 「已隐藏」+ null 头像但保留名次。alwaysIncludeUserId（查询者本人）永不被
 * 排除/遮罩——自己总能看到自己（组共享快照除外，见 finalizeView 注释）。
 * 条目字段仅 userId/nickname/avatarUrl/minutes/sessionCount/rank，任务正文与
 * 活动字段永不进入。
 */
export async function rankFromScores(
  rows: ReadonlyArray<LeaderboardScoreRow>,
  alwaysIncludeUserId?: string,
): Promise<RankingEntry[]> {
  if (rows.length === 0) return [];
  const ids = [...new Set(rows.map((row) => row.user_id))];
  const placeholders = ids.map(() => '?').join(', ');
  const profiles = await database.prepare(
    `SELECT id, COALESCE(NULLIF(display_name, ''), username) AS nickname, avatar_url
     FROM users WHERE id IN (${placeholders})`,
  ).all(...ids) as ProfileRow[];
  const settings = await database.prepare(
    `SELECT user_id, public_display, opted_out FROM leaderboard_settings
     WHERE user_id IN (${placeholders})`,
  ).all(...ids) as SettingsRow[];
  const profileById = new Map(profiles.map((row) => [row.id, row]));
  const settingsById = new Map(settings.map((row) => [row.user_id, row]));
  const staged = rows
    .map((row) => {
      const isSelf = row.user_id === alwaysIncludeUserId;
      const setting = settingsById.get(row.user_id);
      if (!isSelf && setting?.opted_out === 1) return null; // 退出榜单：从他人视图消失
      const hidden = !isSelf && setting?.public_display === 0;
      const profile = profileById.get(row.user_id);
      return {
        userId: row.user_id,
        nickname: hidden ? '已隐藏' : profile?.nickname ?? '已隐藏',
        avatarUrl: hidden ? null : profile?.avatar_url ?? null,
        seconds: row.effective_seconds,
        sessionCount: row.session_count,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  staged.sort((left, right) =>
    right.seconds - left.seconds
    || right.sessionCount - left.sessionCount
    || (left.userId < right.userId ? -1 : 1));
  return staged.map((entry, index) => ({
    userId: entry.userId,
    nickname: entry.nickname,
    avatarUrl: entry.avatarUrl,
    minutes: Math.floor(entry.seconds / 60),
    sessionCount: entry.sessionCount,
    rank: index + 1,
  }));
}

/**
 * 读快照（不可变）：返回统一信封；历史上若存在旧版裸数组的 rankings JSON，
 * 包装为信封（goalMet/groupTotalSeconds 未知 → null）。
 */
export async function readSnapshot(
  scopeType: LeaderboardScopeType,
  scopeId: string,
  weekId: string,
): Promise<SnapshotEnvelope | null> {
  const existing = await database.prepare(
    `SELECT rankings FROM leaderboard_snapshots
     WHERE scope_type = ? AND scope_id = ? AND week_id = ? AND rule_version = ?`,
  ).get(scopeType, scopeId, weekId, LEADERBOARD_RULE_VERSION) as { rankings: string } | undefined;
  if (!existing) return null;
  const parsed = JSON.parse(existing.rankings) as SnapshotEnvelope | RankingEntry[];
  if (Array.isArray(parsed)) {
    return { rankings: parsed, goalMet: null, groupTotalSeconds: null };
  }
  return parsed;
}

/** 写快照（ON CONFLICT DO NOTHING）。返回 true=本次新建（调用方据此做一次性副作用）。 */
export async function writeSnapshot(
  scopeType: LeaderboardScopeType,
  scopeId: string,
  weekId: string,
  envelope: SnapshotEnvelope,
): Promise<boolean> {
  const result = await database.prepare(
    `INSERT INTO leaderboard_snapshots(id, scope_type, scope_id, week_id, rankings, settled_at, rule_version)
     VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
  ).run(randomUUID(), scopeType, scopeId, weekId, JSON.stringify(envelope), nowIso(), LEADERBOARD_RULE_VERSION);
  return result.changes > 0;
}

/** 视图收尾：本人行永远在场——补 youOptedOut 旗标、按当前资料还原自视图昵称；
 *  若快照中本人因退出被排除（组共享口径），末位补提示行（rank 顺延）。 */
export async function finalizeView(
  viewerId: string,
  weekId: string,
  weekOver: boolean,
  snapshotUsed: boolean,
  rankings: ReadonlyArray<RankingEntry>,
): Promise<LeaderboardView> {
  const settings = await getOrCreateLeaderboardSettings(viewerId);
  const list = rankings.map((entry) => ({ ...entry }));
  const profile = await database.prepare(
    `SELECT COALESCE(NULLIF(display_name, ''), username) AS nickname, avatar_url
     FROM users WHERE id = ?`,
  ).get(viewerId) as { nickname: string; avatar_url: string | null } | undefined;
  const selfIndex = list.findIndex((entry) => entry.userId === viewerId);
  if (selfIndex >= 0) {
    list[selfIndex] = {
      ...list[selfIndex],
      nickname: profile?.nickname ?? list[selfIndex].nickname,
      avatarUrl: profile?.avatar_url ?? null,
      ...(settings.optedOut ? { youOptedOut: true as const } : {}),
    };
    return { weekId, isWeekOver: weekOver, rankings: list, snapshotUsed };
  }
  // 本人不在榜中：仅组共享快照且本人当时已退出——补一行便于客户端提示「已退出榜单」。
  const selfScore = await settleUserWeek(viewerId, weekId);
  list.push({
    userId: viewerId,
    nickname: profile?.nickname ?? '已隐藏',
    avatarUrl: profile?.avatar_url ?? null,
    minutes: Math.floor(selfScore.effective_seconds / 60),
    sessionCount: selfScore.session_count,
    rank: list.length + 1,
    ...(settings.optedOut ? { youOptedOut: true as const } : {}),
  });
  return { weekId, isWeekOver: weekOver, rankings: list, snapshotUsed };
}

async function loadFriendIds(userId: string): Promise<string[]> {
  const rows = await database.prepare(
    'SELECT friend_id FROM friendships WHERE user_id = ?',
  ).all(userId) as Array<{ friend_id: string }>;
  return rows.map((row) => row.friend_id);
}

/** 好友周榜：本人 + 好友（本人行永在；退出榜单时带 youOptedOut 提示）。
 *  周末后惰性写查看者私有快照（scope_id=viewerId，信封两字段为 null）。 */
export async function friendsLeaderboard(
  viewerId: string,
  weekId: string,
  nowMs: number = Date.now(),
): Promise<LeaderboardView> {
  assertWeekId(weekId);
  const participants = [viewerId, ...(await loadFriendIds(viewerId))];
  if (isWeekOver(weekId, nowMs)) {
    // 好友榜快照按查看者私有（scope_id=viewerId）：本人行在结算时即保证在场。
    const existing = await readSnapshot('friends', viewerId, weekId);
    if (existing) {
      return await finalizeView(viewerId, weekId, true, true, existing.rankings);
    }
    const rows: LeaderboardScoreRow[] = [];
    for (const userId of participants) {
      rows.push(await settleUserWeek(userId, weekId));
    }
    const rankings = await rankFromScores(rows, viewerId);
    await writeSnapshot('friends', viewerId, weekId, { rankings, goalMet: null, groupTotalSeconds: null });
    return await finalizeView(viewerId, weekId, true, true, rankings);
  }
  const rows: LeaderboardScoreRow[] = [];
  for (const userId of participants) {
    rows.push(await settleUserWeek(userId, weekId));
  }
  return await finalizeView(viewerId, weekId, false, false, await rankFromScores(rows, viewerId));
}

/** 供路由解析 week 参数默认值（当前周）。 */
export function currentWeekId(nowMs: number = Date.now()): string {
  return weekIdOf(nowMs);
}
