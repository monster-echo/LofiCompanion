// 成就规则域（纯函数，自 loficompanion/server 原样搬迁）：与客户端
// react-native/src/features/achievements/domain/rules.ts 同语义，ruleVersion 1。

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
