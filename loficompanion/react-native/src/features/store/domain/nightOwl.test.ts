import { describe, expect, it } from 'vitest';
import type { FocusSessionDoc } from '../../focus/domain/types';
import {
  NIGHT_OWL_TARGET_SLUG,
  nightOwlStats,
  shouldShowNightOwlCard,
} from './nightOwl';

// 夜猫子画像纯函数测试：tz 注入 + 跨零点夜窗（22:00–05:00）+ 14 天窗口。

const TZ = 480; // UTC+8
const NOW = Date.UTC(2026, 8, 9, 12, 0, 0); // 2026-09-09 20:00 北京时间

function session(completedAtUtc: number, status = 'completed'): FocusSessionDoc {
  return {
    id: `s-${completedAtUtc}`,
    clientRequestId: `r-${completedAtUtc}`,
    activity: 'free',
    plannedSeconds: 1500,
    status: status as FocusSessionDoc['status'],
    startedAtUtc: completedAtUtc - 1500_000,
    pauses: [],
    completedAtUtc: status === 'completed' ? completedAtUtc : undefined,
    docVersion: 1,
  };
}

/** 北京时间 → UTC ms（构造可读的本地时刻） */
const bj = (isoLocal: string): number =>
  Date.parse(`${isoLocal}Z`) - TZ * 60_000;

describe('nightOwlStats', () => {
  it('本地 22:00–23:59 与 00:00–04:59 都算夜间（跨零点）', () => {
    const history = [
      session(bj('2026-09-08T22:00:00')),
      session(bj('2026-09-08T23:59:00')),
      session(bj('2026-09-09T00:30:00')),
      session(bj('2026-09-09T04:59:00')),
    ];
    expect(nightOwlStats(history, NOW, { tzOffsetMinutes: TZ }).nightSessions).toBe(4);
  });

  it('边界排除：21:59 与 05:00 不算夜间', () => {
    const history = [
      session(bj('2026-09-08T21:59:00')),
      session(bj('2026-09-09T05:00:00')),
    ];
    expect(nightOwlStats(history, NOW, { tzOffsetMinutes: TZ }).nightSessions).toBe(0);
  });

  it('abandoned / 进行中会话不计入', () => {
    const history = [
      session(bj('2026-09-08T23:00:00'), 'abandoned'),
      { ...session(bj('2026-09-08T23:30:00')), completedAtUtc: undefined, status: 'active' as const },
    ];
    expect(nightOwlStats(history, NOW, { tzOffsetMinutes: TZ }).nightSessions).toBe(0);
  });

  it('14 天窗口外不计入；缺省阈值 3 次', () => {
    const inside = [
      session(bj('2026-09-08T23:00:00')),
      session(bj('2026-09-07T23:00:00')),
    ];
    const outside = session(bj('2026-08-20T23:00:00')); // > 14 天前
    const stats = nightOwlStats([...inside, outside], NOW, { tzOffsetMinutes: TZ });
    expect(stats.nightSessions).toBe(2);
    expect(stats.isNightOwl).toBe(false);
    // 第 3 次命中
    const hit = nightOwlStats([...inside, session(bj('2026-09-06T01:00:00'))], NOW, { tzOffsetMinutes: TZ });
    expect(hit.isNightOwl).toBe(true);
  });

  it('tz 注入生效：同一 UTC 时刻在 UTC+8 为夜、UTC-5 为昼', () => {
    // UTC 2026-09-08T18:00:00 = 北京 02:00（夜）= UTC-5 13:00（昼）
    const utc = Date.UTC(2026, 8, 8, 18, 0, 0);
    expect(nightOwlStats([session(utc)], NOW, { tzOffsetMinutes: 480 }).nightSessions).toBe(1);
    expect(nightOwlStats([session(utc)], NOW, { tzOffsetMinutes: -300 }).nightSessions).toBe(0);
  });
});

describe('shouldShowNightOwlCard', () => {
  const base = {
    stats: { nightSessions: 3, isNightOwl: true },
    product: { entitlementKey: 'skin.official.midnight-workstation' },
    ownedKeys: [] as readonly string[],
    trialActive: false,
    dismissedAtUtc: null as number | null,
    now: NOW,
  };

  it('画像未命中 / 无商品 / 已拥有 / 试用中 → 不显示', () => {
    expect(shouldShowNightOwlCard({ ...base, stats: { nightSessions: 2, isNightOwl: false } })).toBe(false);
    expect(shouldShowNightOwlCard({ ...base, product: null })).toBe(false);
    expect(shouldShowNightOwlCard({ ...base, ownedKeys: ['skin.official.midnight-workstation'] })).toBe(false);
    expect(shouldShowNightOwlCard({ ...base, trialActive: true })).toBe(false);
  });

  it('关闭冷却内不显示；7 天后可再出现', () => {
    const dismissed = NOW - 3 * 86_400_000;
    expect(shouldShowNightOwlCard({ ...base, dismissedAtUtc: dismissed })).toBe(false);
    const old = NOW - 8 * 86_400_000;
    expect(shouldShowNightOwlCard({ ...base, dismissedAtUtc: old })).toBe(true);
  });

  it('目标 slug 常量指向深夜工作台', () => {
    expect(NIGHT_OWL_TARGET_SLUG).toBe('midnight-workstation');
  });
});
