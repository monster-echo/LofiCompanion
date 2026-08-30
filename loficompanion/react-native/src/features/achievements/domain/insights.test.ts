import { describe, expect, it } from 'vitest';
import type { FocusSessionDoc } from '../../focus/domain/types';
import {
  completedEntries,
  entryMinutes,
  formatHours,
  streakDays,
  totalEffectiveSeconds,
  weekActivityMinutes,
  weekDayMinutes,
} from './insights';

/**
 * 成就/记录屏展示选择器测试（P0-A Task 10）。固定时刻与日界口径和
 * focusStore.test.ts 保持一致（Asia/Shanghai、周一为一周首日）。
 */

// 2026-08-30 是周日（上海 10:00）；本周一 = 2026-08-24
const NOW = Date.UTC(2026, 7, 30, 2, 0, 0);
const MIN = 60_000;

function completedDoc(partial: {
  id: string;
  activity: FocusSessionDoc['activity'];
  plannedSeconds: number;
  startedAtUtc: number;
  completedAtUtc: number;
}): FocusSessionDoc {
  return {
    clientRequestId: `req-${partial.id}`,
    pauses: [],
    status: 'completed',
    docVersion: 1,
    ...partial,
  };
}

function entryAt(id: string, activity: FocusSessionDoc['activity'], minutes: number, at: number) {
  return completedDoc({
    id,
    activity,
    plannedSeconds: minutes * 60,
    startedAtUtc: at - minutes * MIN,
    completedAtUtc: at,
  });
}

describe('completedEntries', () => {
  it('只保留 completed 且有完成时刻的文档，新→旧排序', () => {
    const history = [
      entryAt('a', 'homework', 25, NOW - 3 * 86_400_000),
      entryAt('b', 'reading', 10, NOW),
      {
        ...entryAt('c', 'free', 10, NOW - MIN),
        status: 'abandoned' as const,
        abandonedAtUtc: NOW - MIN + 60_000,
      },
      {
        ...entryAt('d', 'coding', 10, NOW),
        completedAtUtc: undefined,
        status: 'active' as const,
      },
    ];
    const entries = completedEntries(history);
    expect(entries.map((entry) => entry.id)).toEqual(['b', 'a']);
    expect(entryMinutes(entries[0])).toBe(10);
    expect(entryMinutes(entries[1])).toBe(25);
  });
});

describe('累计与小时格式', () => {
  it('累计秒数求和；小时一位小数、整数不带小数点', () => {
    const entries = completedEntries([
      entryAt('a', 'homework', 90, NOW),
      entryAt('b', 'reading', 15, NOW - MIN),
    ]);
    expect(totalEffectiveSeconds(entries)).toBe(105 * 60);
    expect(formatHours(totalEffectiveSeconds(entries))).toBe('1.8');
    expect(formatHours(2 * 3_600_000 / 1000)).toBe('2');
    expect(formatHours(0)).toBe('0');
  });
});

describe('weekDayMinutes', () => {
  it('本周一..周日逐日分钟；缺失日为 0；上周不入', () => {
    const monday = NOW - 6 * 86_400_000; // 2026-08-24 10:00 上海
    const entries = completedEntries([
      entryAt('mon', 'homework', 30, monday),
      entryAt('sun', 'reading', 45, NOW),
      entryAt('last-week', 'free', 60, monday - 86_400_000),
    ]);
    expect(weekDayMinutes(entries, NOW)).toEqual([30, 0, 0, 0, 0, 0, 45]);
  });

  it('同日多轮累加；周日为一周最后一天（跨周不归入下周坐标）', () => {
    const entries = completedEntries([
      entryAt('a', 'homework', 20, NOW),
      entryAt('b', 'reading', 25, NOW + 2 * 60 * 60_000),
    ]);
    expect(weekDayMinutes(entries, NOW)[6]).toBe(45);
  });
});

describe('weekActivityMinutes', () => {
  it('分钟降序、同分按活动名升序、0 分钟不入', () => {
    const monday = NOW - 6 * 86_400_000;
    const entries = completedEntries([
      entryAt('a', 'reading', 50, NOW),
      entryAt('b', 'homework', 80, NOW),
      entryAt('c', 'coding', 50, monday),
      entryAt('d', 'free', 30, monday - 86_400_000), // 上周，不入
    ]);
    expect(weekActivityMinutes(entries, NOW)).toEqual([
      { activity: 'homework', minutes: 80 },
      { activity: 'coding', minutes: 50 },
      { activity: 'reading', minutes: 50 },
    ]);
  });
});

describe('streakDays', () => {
  it('今天有完成从今天起算；今天没有从昨天起算；断档重置', () => {
    const day = 86_400_000;
    const entries = completedEntries([
      entryAt('today', 'homework', 20, NOW),
      entryAt('yesterday', 'reading', 20, NOW - day),
      entryAt('d2', 'free', 20, NOW - 2 * day),
      // NOW - 3d 断档
      entryAt('d4', 'coding', 20, NOW - 4 * day),
    ]);
    expect(streakDays(entries, NOW)).toBe(3);

    const noToday = completedEntries([
      entryAt('yesterday', 'reading', 20, NOW - day),
      entryAt('d2', 'free', 20, NOW - 2 * day),
    ]);
    expect(streakDays(noToday, NOW)).toBe(2);

    const yesterdayOnly = completedEntries([entryAt('d2', 'free', 20, NOW - 2 * day)]);
    expect(streakDays(yesterdayOnly, NOW)).toBe(0);
    expect(streakDays([], NOW)).toBe(0);
  });
});
