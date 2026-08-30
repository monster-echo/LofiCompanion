import { effectiveSeconds } from '../../focus/domain/engine';
import type { ActivityType, FocusSessionDoc } from '../../focus/domain/types';

/**
 * 成就/记录屏的展示选择器（P0-A Task 10）。全部为历史的确定性函数——
 * `now` 入参、绝不调用 Date.now()；日界口径与 data/summarize.ts 一致
 * （本地日界 = UTC + tzOffsetMinutes，默认 480 = Asia/Shanghai；周一为
 * 一周首日）。只认 completed 会话，与统计/成就域保持同一口径。
 */

const DAY_MS = 86_400_000;
const DEFAULT_TZ_OFFSET_MINUTES = 480;

/** 时间线/分布用的完成条目（不含进行中与 abandoned） */
export interface CompletedEntry {
  id: string;
  activity: ActivityType;
  /** 本轮有效专注秒数 */
  seconds: number;
  completedAtUtc: number;
}

/** 本周科目分布行（分钟降序，同分按活动名升序，保证确定性） */
export interface ActivitySlice {
  activity: ActivityType;
  minutes: number;
}

/** 本地自然日序号：floor((utc + 偏移) / 24h)，同一天内恒等 */
function dayIndex(utcMs: number, tzOffsetMinutes: number): number {
  return Math.floor((utcMs + tzOffsetMinutes * 60_000) / DAY_MS);
}

/** 周一=0 … 周日=6。epoch 第 0 天是周四 → (dayIndex + 3) % 7 */
function mondayBasedWeekday(shiftedDayIndex: number): number {
  return (((shiftedDayIndex + 3) % 7) + 7) % 7;
}

/** 完成条目（新→旧）；abandoned 与缺失完成时刻的文档不入 */
export function completedEntries(history: readonly FocusSessionDoc[]): CompletedEntry[] {
  return history
    .filter(
      (doc): doc is FocusSessionDoc & { completedAtUtc: number } =>
        doc.status === 'completed' && typeof doc.completedAtUtc === 'number',
    )
    .map((doc) => ({
      id: doc.id,
      activity: doc.activity,
      seconds: effectiveSeconds(doc, doc.completedAtUtc),
      completedAtUtc: doc.completedAtUtc,
    }))
    .sort((a, b) => b.completedAtUtc - a.completedAtUtc);
}

/** 累计有效专注秒数（S07 累计专注 = Σ completed effectiveSeconds） */
export function totalEffectiveSeconds(entries: readonly CompletedEntry[]): number {
  return entries.reduce((sum, entry) => sum + entry.seconds, 0);
}

/** 展示小时：一位小数、整数不带小数点（displayMetric 用） */
export function formatHours(seconds: number): string {
  const hours = Math.round(seconds / 360) / 10;
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

/** 分钟展示值（条目级四舍五入，与 summarize 的总量口径一致量级） */
export function entryMinutes(entry: CompletedEntry): number {
  return Math.round(entry.seconds / 60);
}

/**
 * 本周一..周日逐日专注分钟（S08 七日柱图）。缺失日为 0，不插值。
 */
export function weekDayMinutes(
  entries: readonly CompletedEntry[],
  now: number,
  tzOffsetMinutes: number = DEFAULT_TZ_OFFSET_MINUTES,
): number[] {
  const todayIdx = dayIndex(now, tzOffsetMinutes);
  const weekStartIdx = todayIdx - mondayBasedWeekday(todayIdx);
  const buckets = new Array<number>(7).fill(0);
  for (const entry of entries) {
    const offset = dayIndex(entry.completedAtUtc, tzOffsetMinutes) - weekStartIdx;
    if (offset >= 0 && offset <= 6) buckets[offset] += entry.seconds / 60;
  }
  return buckets.map((minutes) => Math.round(minutes));
}

/** 本周科目分钟分布（S08 科目分布；0 分钟活动不入） */
export function weekActivityMinutes(
  entries: readonly CompletedEntry[],
  now: number,
  tzOffsetMinutes: number = DEFAULT_TZ_OFFSET_MINUTES,
): ActivitySlice[] {
  const todayIdx = dayIndex(now, tzOffsetMinutes);
  const weekStartIdx = todayIdx - mondayBasedWeekday(todayIdx);
  const secondsByActivity = new Map<ActivityType, number>();
  for (const entry of entries) {
    const offset = dayIndex(entry.completedAtUtc, tzOffsetMinutes) - weekStartIdx;
    if (offset < 0 || offset > 6) continue;
    secondsByActivity.set(
      entry.activity,
      (secondsByActivity.get(entry.activity) ?? 0) + entry.seconds,
    );
  }
  return [...secondsByActivity.entries()]
    .map(([activity, seconds]) => ({ activity, minutes: Math.round(seconds / 60) }))
    .filter((slice) => slice.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes || a.activity.localeCompare(b.activity));
}

/**
 * 连续学习天数（S07 指标）：从今天起算（今天还没有则从昨天起算），
 * 每日 ≥1 次完成——与 summarize().streakDays 同一口径。
 */
export function streakDays(
  entries: readonly CompletedEntry[],
  now: number,
  tzOffsetMinutes: number = DEFAULT_TZ_OFFSET_MINUTES,
): number {
  const completionDays = new Set(entries.map((entry) => dayIndex(entry.completedAtUtc, tzOffsetMinutes)));
  const todayIdx = dayIndex(now, tzOffsetMinutes);
  let cursor = completionDays.has(todayIdx)
    ? todayIdx
    : completionDays.has(todayIdx - 1)
      ? todayIdx - 1
      : Number.NaN;
  let streak = 0;
  while (completionDays.has(cursor)) {
    streak += 1;
    cursor -= 1;
  }
  return streak;
}
