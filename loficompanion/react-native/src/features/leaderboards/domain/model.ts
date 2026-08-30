// 排行/小组客户端域纯函数（doc-08 §11–§14、docs/03 §9）。
// 周界口径必须与服务端 leaderboards/domain/week.ts + settlement.ts 的单一实现
// 逐位一致（周一 00:00 UTC+8、ISO 周四定年）——客户端只读 weekId，不自行结算。

export const TZ_OFFSET_MS = 8 * 3_600_000;
export const DAY_MS = 86_400_000;

/** nowMs 所在 ISO 周（周一界）的周一 00:00（UTC+8）对应 UTC 瞬间。 */
export function weekStartMs(nowMs: number): number {
  const days = Math.floor((nowMs + TZ_OFFSET_MS) / DAY_MS);
  const monday = days - ((days + 3) % 7); // epoch day 0 = 周四；(d+3)%7: 0=周一
  return monday * DAY_MS - TZ_OFFSET_MS;
}

/** ISO 周标识 `YYYY-Www`（ISO 8601：周号由该周的周四决定）——与服务端同口径。 */
export function weekIdOf(nowMs: number): string {
  const thursdayMs = weekStartMs(nowMs) + 3 * DAY_MS; // 周四 00:00（UTC+8）
  const isoYear = new Date(thursdayMs + TZ_OFFSET_MS).getUTCFullYear();
  const yearStartMs = Date.UTC(isoYear, 0, 1) - TZ_OFFSET_MS; // 该年 1 月 1 日 00:00（UTC+8）
  const week = Math.floor((thursdayMs - yearStartMs) / DAY_MS / 7) + 1;
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

/** 上一周的周一 00:00（UTC+8）——周结算（S13）查询口径。 */
export function previousWeekStartMs(nowMs: number): number {
  return weekStartMs(nowMs) - 7 * DAY_MS;
}

export type RankAccent = 'gold' | 'silver' | 'bronze';

/** 前三名次圆片色别（doc-08 §11：旧金/雾银/木铜，低饱和，不用领奖台）。 */
export function rankAccent(rank: number): RankAccent | null {
  if (rank === 1) return 'gold';
  if (rank === 2) return 'silver';
  if (rank === 3) return 'bronze';
  return null;
}

/** 目标进度 0..1（goal ≤ 0 视为无目标 → 0；不产生负数/越界宽度）。 */
export function goalProgress(currentMinutes: number, goalMinutes: number): number {
  if (goalMinutes <= 0) return 0;
  return Math.max(0, Math.min(1, currentMinutes / goalMinutes));
}

/** 头像占位：昵称首字符（按码位取，兼容代理对）；空昵称回退「友」。 */
export function avatarInitial(nickname: string): string {
  const trimmed = nickname.trim();
  if (!trimmed) return '友';
  return Array.from(trimmed)[0] ?? '友';
}
