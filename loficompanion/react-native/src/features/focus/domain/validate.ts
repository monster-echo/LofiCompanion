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
