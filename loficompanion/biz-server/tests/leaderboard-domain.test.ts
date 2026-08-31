import assert from 'node:assert/strict';
import { test } from 'node:test';

// 榜单纯域搬迁守护：week.ts / settlement.ts 自 loficompanion/server 原样搬迁，
// 这里锁定关键口径（周一界 UTC+8、ISO 周标识、每日 180 分钟上限）防回归。

const { weekStartIso, DAY_MS } = await import('../src/features/leaderboards/domain/week.ts');
const { applyDailyCap, isWeekOver, weekIdOf, weekStartMsOfId } = await import(
  '../src/features/leaderboards/domain/settlement.ts'
);

test('weekStartIso returns Monday 00:00 UTC+8 as UTC ISO', () => {
  // 2026-08-29（周六）13:00 UTC → 所在周周一 2026-08-24 00:00 UTC+8 = 2026-08-23 16:00Z
  assert.equal(weekStartIso(Date.UTC(2026, 7, 29, 13, 0)), '2026-08-23T16:00:00.000Z');
  // 周一当天 00:00 UTC+8 自映射
  assert.equal(weekStartIso(Date.UTC(2026, 7, 23, 16, 0)), '2026-08-23T16:00:00.000Z');
});

test('weekIdOf produces ISO YYYY-Www with Monday boundary', () => {
  // 2026-01-01 是周四 → 属 2026-W01
  assert.equal(weekIdOf(Date.UTC(2026, 0, 1)), '2026-W01');
  // ISO 8601：2021-01-01（周五）属 2020-W53
  assert.equal(weekIdOf(Date.UTC(2021, 0, 1)), '2020-W53');
});

test('weekStartMsOfId round-trips with weekIdOf and rejects bad formats', () => {
  const nowMs = Date.UTC(2026, 7, 29, 13, 0);
  const weekId = weekIdOf(nowMs);
  const startMs = weekStartMsOfId(weekId);
  assert.equal(weekStartIso(nowMs), new Date(startMs!).toISOString());
  assert.equal(weekStartMsOfId('2026-W54'), null);
  assert.equal(weekStartMsOfId('2026-W1'), null);
  assert.equal(weekStartMsOfId('not-a-week'), null);
});

test('isWeekOver gates on next Monday 00:00 UTC+8', () => {
  const weekId = '2026-W35'; // 周一 2026-08-24 00:00 UTC+8
  const startMs = weekStartMsOfId(weekId)!;
  assert.equal(isWeekOver(weekId, startMs + 7 * DAY_MS - 1), false);
  assert.equal(isWeekOver(weekId, startMs + 7 * DAY_MS), true);
});

test('applyDailyCap caps per UTC+8 day and skips empty sessions', () => {
  const monday = weekStartMsOfId('2026-W35')!;
  const at = (offsetMs: number) => new Date(monday + offsetMs).toISOString();
  const sessions = [
    { effective_seconds: 120 * 60, ended_at: at(2 * 60 * 60 * 1000) }, // 周一 120min
    { effective_seconds: 90 * 60, ended_at: at(3 * 60 * 60 * 1000) },  // 周一 90min → 裁到 60
    { effective_seconds: 0, ended_at: at(4 * 60 * 60 * 1000) },        // 0 秒不计
    { effective_seconds: 30 * 60, ended_at: at(26 * 60 * 60 * 1000) }, // 周二 30min
    { effective_seconds: 10 * 60, ended_at: null },                    // 无结束时间不计
  ];
  assert.deepEqual(applyDailyCap(sessions), { totalSeconds: (180 + 30) * 60, sessionCount: 3 });
  assert.deepEqual(applyDailyCap([]), { totalSeconds: 0, sessionCount: 0 });
});
