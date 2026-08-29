import type { ActivityType } from './types';

/** doc-01 §5.3：P0 快捷时长 15/25/45/60 分钟。 */
export const QUICK_DURATIONS = [15, 25, 45, 60];

export const DEFAULT_ACTIVITY: ActivityType = 'homework';
export const DEFAULT_DURATION = 25;

const MIN_MINUTES = 5;
const MAX_MINUTES = 180;

/** 自定义时长校验：5..180 的整数分钟合法返回原值，否则 null（UI 提示）。 */
export function validateCustomDuration(minutes: number): number | null {
  if (!Number.isFinite(minutes)) return null;
  if (!Number.isInteger(minutes)) return null;
  if (minutes < MIN_MINUTES || minutes > MAX_MINUTES) return null;
  return minutes;
}

/** 全部合法活动类型（doc-01 §5.3 P0 五类）。 */
const ACTIVITY_TYPES: readonly ActivityType[] = [
  'homework',
  'reading',
  'coding',
  'vocab',
  'free',
];

export interface SessionInput {
  activity: ActivityType;
  plannedSeconds: number;
}

/**
 * 会话创建输入的整体校验：activity 必须是 5 类之一，时长须是合法自定义
 * 分钟数或快捷时长之一（同一 5..180 规则）。任一不合法返回 null。
 */
export function validateSessionInput(activity: string, minutes: number): SessionInput | null {
  const knownActivity = (ACTIVITY_TYPES as readonly string[]).includes(activity);
  const validMinutes =
    validateCustomDuration(minutes) ?? (QUICK_DURATIONS.includes(minutes) ? minutes : null);
  if (!knownActivity || validMinutes === null) return null;
  return { activity: activity as ActivityType, plannedSeconds: validMinutes * 60 };
}
