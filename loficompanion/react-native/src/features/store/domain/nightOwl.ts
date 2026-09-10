import type { FocusSessionDoc } from '../../focus/domain/types';

/**
 * 夜猫子画像（纯函数、node 可测，tz 注入模式对齐 summarize.ts）：
 * 近 N 天内本地时间 22:00–05:00 完成的专注达到阈值 → 场景化推荐夜色主题。
 * 数据源 = 本地 focus.history（completedAtUtc UTC ms），无服务端依赖。
 */

/** 场景化推荐目标皮肤（首个夜色主题；后续夜色主题可在此扩展规则表） */
export const NIGHT_OWL_TARGET_SLUG = 'midnight-workstation';

export interface NightOwlStats {
  /** 统计窗口内夜间完成的会话数 */
  readonly nightSessions: number;
  /** 是否命中夜猫子画像（≥ minSessions） */
  readonly isNightOwl: boolean;
}

export interface NightOwlOptions {
  /** 本地时区偏移（分钟，UTC+X 为正；缺省 480 = UTC+8） */
  readonly tzOffsetMinutes?: number;
  /** 统计窗口天数（缺省 14） */
  readonly windowDays?: number;
  /** 命中阈值（缺省 3 次） */
  readonly minSessions?: number;
}

export function nightOwlStats(
  history: readonly FocusSessionDoc[],
  now: number,
  options: NightOwlOptions = {},
): NightOwlStats {
  const tzOffsetMinutes = options.tzOffsetMinutes ?? 480;
  const windowDays = options.windowDays ?? 14;
  const minSessions = options.minSessions ?? 3;
  const windowStartMs = now - windowDays * 86_400_000;
  // 本地小时：UTC ms + 偏移后取当日小时（22:00–23:59 与 00:00–04:59 跨零点）
  const localHourOf = (utcMs: number): number =>
    Math.floor((((utcMs + tzOffsetMinutes * 60_000) % 86_400_000) + 86_400_000) % 86_400_000 / 3_600_000);
  const isNightHour = (hour: number): boolean => hour >= 22 || hour < 5;
  const nightSessions = history.filter((doc) =>
    doc.status === 'completed'
    && doc.completedAtUtc !== undefined
    && doc.completedAtUtc >= windowStartMs
    && doc.completedAtUtc <= now
    && isNightHour(localHourOf(doc.completedAtUtc)),
  ).length;
  return { nightSessions, isNightOwl: nightSessions >= minSessions };
}

export interface NightOwlCardInput {
  readonly stats: NightOwlStats;
  readonly product: { readonly entitlementKey: string } | null;
  readonly ownedKeys: readonly string[];
  /** 该皮肤试用中（试用是更强的触达语境，不重复推卡） */
  readonly trialActive: boolean;
  /** 上次关闭时间（null=从未关闭） */
  readonly dismissedAtUtc: number | null;
  readonly now: number;
  /** 关闭冷却（缺省 7 天） */
  readonly dismissCooldownDays?: number;
}

/** 推荐卡显示条件组合（夜猫子画像 + 未拥有 + 未试用 + 关闭冷却已过）。 */
export function shouldShowNightOwlCard(input: NightOwlCardInput): boolean {
  if (!input.stats.isNightOwl) return false;
  if (input.product === null) return false;
  if (input.ownedKeys.includes(input.product.entitlementKey)) return false;
  if (input.trialActive) return false;
  if (input.dismissedAtUtc !== null) {
    const cooldownMs = (input.dismissCooldownDays ?? 7) * 86_400_000;
    if (input.now - input.dismissedAtUtc < cooldownMs) return false;
  }
  return true;
}
