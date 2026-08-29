import { effectiveSeconds } from '../domain/engine';
import type { ActivityType, FocusSessionDoc } from '../domain/types';

/**
 * 学习统计纯函数（P0-A Task 6）。无 I/O：history 入参、`now` 入参，
 * 不调用 Date.now()、不依赖设备时区（日界由 tzOffsetMinutes 注入）。
 *
 * 语义约定：只统计 completed 会话——streak 要求「当日 ≥1 次完成」，
 * todaySessions/分钟数/科目分布与成就域（CompletedSession 快照）保持同一
 * 口径；abandoned 会话仅用于离线同步与审计，不计入统计。
 */

export interface StudySummary {
  todayMinutes: number;
  todaySessions: number;
  weekMinutes: number;
  weekTargetMinutes: number;
  /** 连续天数：从今天起算（今天还没有则从昨天起算），每日 ≥1 次完成 */
  streakDays: number;
  /** 本周科目分钟分布，按分钟降序（同分按活动名升序，保证确定性） */
  byActivity: { activity: ActivityType; minutes: number }[];
}

export interface SummarizeOptions {
  weekTargetMinutes?: number;
  /** 本地日界 = UTC + 该偏移；默认 480 = Asia/Shanghai */
  tzOffsetMinutes?: number;
}

const DAY_MS = 86_400_000;
const DEFAULT_TZ_OFFSET_MINUTES = 480; // Asia/Shanghai（UTC+8）
const DEFAULT_WEEK_TARGET_MINUTES = 300; // 每周 5 小时（doc-01）

/** 本地自然日序号：floor((utc + 偏移) / 24h)，同一天内恒等。 */
function dayIndex(utcMs: number, tzOffsetMinutes: number): number {
  return Math.floor((utcMs + tzOffsetMinutes * 60_000) / DAY_MS);
}

/** 周一=0 … 周日=6。epoch 第 0 天是周四 → (dayIndex + 3) % 7。 */
function mondayBasedWeekday(shiftedDayIndex: number): number {
  return (((shiftedDayIndex + 3) % 7) + 7) % 7;
}

export function summarize(
  history: readonly FocusSessionDoc[],
  now: number,
  options: SummarizeOptions = {},
): StudySummary {
  const tzOffsetMinutes = options.tzOffsetMinutes ?? DEFAULT_TZ_OFFSET_MINUTES;
  const weekTargetMinutes = options.weekTargetMinutes ?? DEFAULT_WEEK_TARGET_MINUTES;

  const todayIdx = dayIndex(now, tzOffsetMinutes);
  const weekStartIdx = todayIdx - mondayBasedWeekday(todayIdx); // 本周一 00:00（本地）
  const weekEndIdx = weekStartIdx + 6;

  const completions = history.filter(
    (doc) => doc.status === 'completed' && typeof doc.completedAtUtc === 'number',
  );

  let todaySeconds = 0;
  let todaySessions = 0;
  let weekSeconds = 0;
  const secondsByActivity = new Map<ActivityType, number>();

  for (const doc of completions) {
    const end = doc.completedAtUtc as number;
    const idx = dayIndex(end, tzOffsetMinutes);
    const seconds = effectiveSeconds(doc, end);
    if (idx === todayIdx) {
      todaySeconds += seconds;
      todaySessions += 1;
    }
    if (idx >= weekStartIdx && idx <= weekEndIdx) {
      weekSeconds += seconds;
      secondsByActivity.set(doc.activity, (secondsByActivity.get(doc.activity) ?? 0) + seconds);
    }
  }

  const completionDays = new Set(
    completions.map((doc) => dayIndex(doc.completedAtUtc as number, tzOffsetMinutes)),
  );
  let cursor = completionDays.has(todayIdx)
    ? todayIdx
    : completionDays.has(todayIdx - 1)
      ? todayIdx - 1
      : Number.NaN;
  let streakDays = 0;
  while (completionDays.has(cursor)) {
    streakDays += 1;
    cursor -= 1;
  }

  const byActivity = [...secondsByActivity.entries()]
    .map(([activity, seconds]) => ({ activity, minutes: Math.round(seconds / 60) }))
    .sort((a, b) => b.minutes - a.minutes || a.activity.localeCompare(b.activity));

  return {
    todayMinutes: Math.round(todaySeconds / 60),
    todaySessions,
    weekMinutes: Math.round(weekSeconds / 60),
    weekTargetMinutes,
    streakDays,
    byActivity,
  };
}
