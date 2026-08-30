import { randomUUID } from 'node:crypto';
import { database, nowIso } from '@/server/database';

// 服务端成就结算（docs/01 §5.6、docs/03 §9）：成就只由服务端根据有效会话与
// 规则版本发放；同一成就同一规则版本只发一次（UNIQUE 兜底 + 事务内评估）。
// 规则与客户端 react-native/src/features/achievements/domain/rules.ts 同语义，
// ruleVersion 1。

export type AchievementRuleKey = 'first_focus' | 'streak_7' | 'rainy_10h' | 'sessions_100';
export type RoomItemId = 'bookmark' | 'lamp' | 'plant' | 'group_photo';

export interface AchievementDef {
  ruleKey: AchievementRuleKey;
  name: string;
  description: string;
  rewardItemId: RoomItemId;
  ruleVersion: 1;
}

export const ACHIEVEMENT_DEFS: readonly AchievementDef[] = [
  { ruleKey: 'first_focus', name: '第一次专注', description: '完成 1 轮专注', rewardItemId: 'bookmark', ruleVersion: 1 },
  { ruleKey: 'streak_7', name: '连续七天', description: '连续 7 天各有至少 1 轮完成', rewardItemId: 'lamp', ruleVersion: 1 },
  { ruleKey: 'rainy_10h', name: '雨夜十小时', description: '累计专注 10 小时', rewardItemId: 'plant', ruleVersion: 1 },
  { ruleKey: 'sessions_100', name: '百轮学习', description: '完成 100 轮专注', rewardItemId: 'group_photo', ruleVersion: 1 },
];

export function rewardFor(ruleKey: AchievementRuleKey): RoomItemId {
  return ACHIEVEMENT_DEFS.find((def) => def.ruleKey === ruleKey)!.rewardItemId;
}

const TZ_OFFSET_MS = 8 * 60 * 60 * 1000; // Asia/Shanghai

function dayIndex(utcMs: number): number {
  return Math.floor((utcMs + TZ_OFFSET_MS) / (24 * 60 * 60 * 1000));
}

interface CompletedRow {
  effective_seconds: number;
  ended_at: string | null;
}

/** 纯评估：返回当前应发而未发的规则键（与客户端 evaluateGrants 同语义）。 */
export function evaluateGrants(
  history: readonly CompletedRow[],
  alreadyGranted: readonly AchievementRuleKey[],
): AchievementRuleKey[] {
  const totalSeconds = history.reduce((sum, row) => sum + Math.max(0, row.effective_seconds), 0);
  const daySet = new Set(history.map((row) => dayIndex(row.ended_at ? Date.parse(row.ended_at) : 0)));
  let bestStreak = 0;
  for (const day of daySet) {
    if (daySet.has(day - 1)) continue; // 只从每段连续起点计数
    let length = 0;
    while (daySet.has(day + length)) length += 1;
    bestStreak = Math.max(bestStreak, length);
  }
  const triggered = new Set<AchievementRuleKey>();
  if (history.length >= 1) triggered.add('first_focus');
  if (bestStreak >= 7) triggered.add('streak_7');
  if (totalSeconds >= 36000) triggered.add('rainy_10h');
  if (history.length >= 100) triggered.add('sessions_100');
  return [...triggered].filter((key) => !alreadyGranted.includes(key));
}

async function loadHistory(userId: string): Promise<CompletedRow[]> {
  return await database.prepare(
    `SELECT effective_seconds, ended_at FROM focus_sessions
     WHERE user_id = ? AND status = 'completed'`,
  ).all(userId) as CompletedRow[];
}

async function loadGranted(userId: string): Promise<AchievementRuleKey[]> {
  const rows = await database.prepare(
    'SELECT rule_key FROM achievement_grants WHERE user_id = ? AND rule_version = 1',
  ).all(userId) as Array<{ rule_key: AchievementRuleKey }>;
  return rows.map((row) => row.rule_key);
}

/**
 * 会话结算事务内调用：评估 → 发放 → 房间收藏物入库。
 * UNIQUE(user_id, rule_key, rule_version) / UNIQUE(user_id, room_item_id)
 * 兜底并发与重放；调用方负责把本函数放进与结算相同的数据库事务。
 */
export async function grantNewlyEarnedForSession(
  userId: string,
  sourceSessionId: string,
): Promise<Array<{ ruleKey: AchievementRuleKey; rewardItemId: RoomItemId }>> {
  const history = await loadHistory(userId);
  const already = await loadGranted(userId);
  const toGrant = evaluateGrants(history, already);
  const granted: Array<{ ruleKey: AchievementRuleKey; rewardItemId: RoomItemId }> = [];
  const now = nowIso();
  for (const ruleKey of toGrant) {
    const def = ACHIEVEMENT_DEFS.find((candidate) => candidate.ruleKey === ruleKey)!;
    const grantId = randomUUID();
    await database.prepare(
      `INSERT INTO achievement_grants(id, user_id, rule_key, rule_version, source_session_id, granted_at)
       VALUES (?, ?, ?, 1, ?, ?) ON CONFLICT (user_id, rule_key, rule_version) DO NOTHING`,
    ).run(grantId, userId, ruleKey, sourceSessionId, now);
    await database.prepare(
      `INSERT INTO user_room_items(user_id, room_item_id, source_grant_id, unlocked_at)
       SELECT ?, id, ?, ? FROM room_items WHERE item_id = ?
       ON CONFLICT (user_id, room_item_id) DO NOTHING`,
    ).run(userId, grantId, now, def.rewardItemId);
    granted.push({ ruleKey, rewardItemId: def.rewardItemId });
  }
  return granted;
}

export async function listAchievementsForUser(userId: string) {
  const granted = await database.prepare(
    'SELECT rule_key, granted_at, source_session_id FROM achievement_grants WHERE user_id = ? AND rule_version = 1',
  ).all(userId) as Array<{ rule_key: AchievementRuleKey; granted_at: string; source_session_id: string | null }>;
  const grantedByKey = new Map(granted.map((row) => [row.rule_key, row]));
  return ACHIEVEMENT_DEFS.map((def) => ({
    ...def,
    grantedAt: grantedByKey.get(def.ruleKey)?.granted_at ?? null,
    sourceSessionId: grantedByKey.get(def.ruleKey)?.source_session_id ?? null,
  }));
}

export async function listRoomItemsForUser(userId: string) {
  return await database.prepare(
    `SELECT ri.item_id, ri.name, ri.source_rule_key, uri.unlocked_at
     FROM user_room_items uri JOIN room_items ri ON ri.id = uri.room_item_id
     WHERE uri.user_id = ? ORDER BY uri.unlocked_at`,
  ).all(userId) as Array<{ item_id: RoomItemId; name: string; source_rule_key: string; unlocked_at: string }>;
}
