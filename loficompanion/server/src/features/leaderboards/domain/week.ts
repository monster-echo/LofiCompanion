// 周界口径：周一 00:00（Asia/Shanghai，UTC+8）——与 focus-repository weeklySummary
// 及客户端 summarize 同口径（docs/03 §9 可重建口径）。
// 注意：Task 2 的 weekIdOf（YYYY-Www）按计划落在 domain/settlement.ts，其周界
// 必须复用本函数，保持全埢单一周界实现、不产生第二份漂移。

// Asia/Shanghai 固定偏移与日长：全域周界/日界共用同一常量（docs/03 §9 口径）。
export const TZ_OFFSET_MS = 8 * 60 * 60 * 1000;
export const DAY_MS = 86_400_000;

function dayIndex(utcMs: number): number {
  return Math.floor((utcMs + TZ_OFFSET_MS) / DAY_MS);
}

/** nowMs 所在 ISO 周（周一界）的周一 00:00（UTC+8）对应 UTC ISO 时刻。 */
export function weekStartIso(nowMs: number = Date.now()): string {
  const days = dayIndex(nowMs);
  const monday = days - ((days + 3) % 7); // epoch day 0 = 周四；(d+3)%7: 0=周一
  return new Date(monday * DAY_MS - TZ_OFFSET_MS).toISOString();
}
