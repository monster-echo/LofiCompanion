/**
 * 成就域纯规则（P0-A Task 5）。全部为历史快照的确定性函数——`now` 一律
 * 入参、绝不调用 Date.now()、不改入参。ruleVersion 1：规则含义永远绑定
 * 版本号，日后改阈值必须升版本，已授予成就不回收。
 */

export type AchievementRuleKey = 'first_focus' | 'streak_7' | 'rainy_10h' | 'sessions_100';

/** 房间收藏物（成就奖励，摆进书房场景） */
export type RoomItemId = 'bookmark' | 'lamp' | 'plant' | 'group_photo';

/** 已完成的专注会话的最小快照（由计时域推导，不含进行中的会话） */
export interface CompletedSession {
  activity: string;
  effectiveSeconds: number;
  completedAtUtc: number;
}

export interface AchievementDef {
  ruleKey: AchievementRuleKey;
  name: string;
  description: string;
  rewardItemId: RoomItemId;
  ruleVersion: 1;
}

const FIRST_FOCUS_MIN_SESSIONS = 1;
const STREAK_7_DAYS = 7;
const RAINY_10H_SECONDS = 36_000; // 10 小时
const SESSIONS_100_COUNT = 100;

/** 自然日按 Asia/Shanghai（UTC+8）切分：dayIndex = floor((utc + 8h) / 24h) */
const SHANGHAI_OFFSET_MS = 8 * 3_600_000;
const DAY_MS = 86_400_000;

export const ACHIEVEMENT_DEFS: readonly AchievementDef[] = [
  {
    ruleKey: 'first_focus',
    name: '第一次专注',
    description: '完成第一次专注',
    rewardItemId: 'bookmark',
    ruleVersion: 1,
  },
  {
    ruleKey: 'streak_7',
    name: '连续七天',
    description: '连续 7 天每天至少完成一次专注',
    rewardItemId: 'lamp',
    ruleVersion: 1,
  },
  {
    ruleKey: 'rainy_10h',
    name: '雨夜十小时',
    description: '累计有效专注满 10 小时',
    rewardItemId: 'plant',
    ruleVersion: 1,
  },
  {
    ruleKey: 'sessions_100',
    name: '百轮学习',
    description: '累计完成 100 次专注',
    rewardItemId: 'group_photo',
    ruleVersion: 1,
  },
];

/** 成就 → 奖励收藏物。 */
export function rewardFor(ruleKey: AchievementRuleKey): RoomItemId {
  const def = ACHIEVEMENT_DEFS.find((item) => item.ruleKey === ruleKey);
  if (!def) throw new Error(`未知成就规则：${ruleKey}`);
  return def.rewardItemId;
}

function shanghaiDayIndex(completedAtUtc: number): number {
  return Math.floor((completedAtUtc + SHANGHAI_OFFSET_MS) / DAY_MS);
}

/**
 * 以「最近一次会话所在上海自然日」为终点向前数的连续天数。
 * 同日多次会话只算一天；断档即重置；连击不要求包含 now（最近会话可以
 * 停在几天前——离线补同步不丢成就）。
 */
function trailingStreakDays(history: readonly CompletedSession[]): number {
  if (history.length === 0) return 0;
  const days = new Set<number>(history.map((s) => shanghaiDayIndex(s.completedAtUtc)));
  let cursor = Math.max(...days);
  let run = 0;
  while (days.has(cursor)) {
    run += 1;
    cursor -= 1;
  }
  return run;
}

/**
 * 评估应授予的成就：触发 − 已授予，按 ACHIEVEMENT_DEFS 顺序输出。
 * `now` 供未来依赖评估时刻的规则使用（v1 规则均只看历史快照）。
 */
export function evaluateGrants(
  history: readonly CompletedSession[],
  alreadyGranted: readonly AchievementRuleKey[],
  now: number,
): AchievementRuleKey[] {
  void now;
  const granted = new Set<AchievementRuleKey>(alreadyGranted); // 防御性去重
  const triggered = new Set<AchievementRuleKey>();

  if (history.length >= FIRST_FOCUS_MIN_SESSIONS) triggered.add('first_focus');
  if (trailingStreakDays(history) >= STREAK_7_DAYS) triggered.add('streak_7');
  const totalSeconds = history.reduce((sum, s) => sum + s.effectiveSeconds, 0);
  if (totalSeconds >= RAINY_10H_SECONDS) triggered.add('rainy_10h');
  if (history.length >= SESSIONS_100_COUNT) triggered.add('sessions_100');

  return ACHIEVEMENT_DEFS.map((def) => def.ruleKey).filter(
    (ruleKey) => triggered.has(ruleKey) && !granted.has(ruleKey),
  );
}
