import { DAY_MS, TZ_OFFSET_MS, weekStartIso } from './week';

// 榜单结算纯函数（docs/03 §9、docs/01 §5.7，rule_version=2）：
// - 周标识 weekIdOf：ISO `YYYY-Www`，周一界 UTC+8，周界复用 domain/week.ts 单一实现；
// - 每日计入上限：按 UTC+8 日分组，每日分钟数裁剪到上限后求和（默认 180 分钟）。
// 本模块保持纯（无 IO / 无框架依赖），由 score-repository 落库。

export { weekStartIso, DAY_MS, TZ_OFFSET_MS };

/** ISO 周标识 `YYYY-Www`：ISO 年与周号由该周的周四决定（ISO 8601）。 */
export function weekIdOf(nowMs: number): string {
  const mondayMs = Date.parse(weekStartIso(nowMs));
  const thursdayMs = mondayMs + 3 * DAY_MS; // 周四 00:00（UTC+8）
  const isoYear = new Date(thursdayMs + TZ_OFFSET_MS).getUTCFullYear();
  const yearStartMs = Date.UTC(isoYear, 0, 1) - TZ_OFFSET_MS; // 该年 1 月 1 日 00:00（UTC+8）
  const week = Math.floor((thursdayMs - yearStartMs) / DAY_MS / 7) + 1;
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

/** weekId → 该周周一 00:00（UTC+8）的 UTC 瞬间；格式非法返回 null。
 *  1 月 4 日恒在 ISO 周 1 → 其所在周的周一即周 1 周一。 */
export function weekStartMsOfId(weekId: string): number | null {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekId);
  if (!match) return null;
  const year = Number(match[1]);
  const week = Number(match[2]);
  if (week < 1 || week > 53) return null;
  const jan4Day = Math.floor((Date.UTC(year, 0, 4) + TZ_OFFSET_MS) / DAY_MS);
  const week1Monday = jan4Day - ((jan4Day + 3) % 7);
  return (week1Monday + (week - 1) * 7) * DAY_MS - TZ_OFFSET_MS;
}

/** 该周是否已结束（nowMs 已越过下周一 00:00 UTC+8）——快照惰性结算的闸门。 */
export function isWeekOver(weekId: string, nowMs: number): boolean {
  const startMs = weekStartMsOfId(weekId);
  return startMs !== null && startMs + 7 * DAY_MS <= nowMs;
}

export interface ScoreableSession {
  effective_seconds: number;
  ended_at: string | null;
}

export interface CappedWeekTotals {
  totalSeconds: number;
  sessionCount: number;
}

/**
 * rule_version=2 聚合：按 ended_at 的 UTC+8 落日分组，每日计入分钟裁剪到
 * capMinutes（默认 180，docs/01 §5.7），再求和。约定：跨午夜会话整段计入
 * 结束日（会话只报 ended_at，落日归属确定且可重建）；0 秒会话不计入
 * 分钟也不计入 sessionCount。中途退出（abandoned）不入账本，由调用方过滤。
 */
export function applyDailyCap(
  sessions: ReadonlyArray<ScoreableSession>,
  capMinutes = 180,
): CappedWeekTotals {
  const capSeconds = capMinutes * 60;
  const secondsByDay = new Map<number, number>();
  let sessionCount = 0;
  for (const session of sessions) {
    if (session.effective_seconds <= 0 || !session.ended_at) continue;
    sessionCount += 1;
    const day = Math.floor((Date.parse(session.ended_at) + TZ_OFFSET_MS) / DAY_MS);
    secondsByDay.set(day, (secondsByDay.get(day) ?? 0) + Math.max(0, session.effective_seconds));
  }
  let totalSeconds = 0;
  for (const seconds of secondsByDay.values()) {
    totalSeconds += Math.min(seconds, capSeconds);
  }
  return { totalSeconds, sessionCount };
}
