import { describe, expect, test } from 'vitest';
import {
  avatarInitial, goalProgress, previousWeekStartMs, rankAccent, weekIdOf, weekStartMs,
} from './model';

// 周界口径与服务端 tests/leaderboard.test.ts 同一组向量：客户端 weekIdOf
// 必须与 server leaderboards/domain/settlement.ts 逐位一致（docs/03 §9）。
describe('weekIdOf（周一界 UTC+8，ISO 周四定年）', () => {
  test('周日与次日周一分属两周；UTC+8 日界', () => {
    expect(weekIdOf(Date.parse('2026-08-30T02:00:00Z'))).toBe('2026-W35');
    expect(weekIdOf(Date.parse('2026-08-31T02:00:00Z'))).toBe('2026-W36');
    expect(weekIdOf(Date.parse('2026-08-30T15:59:00Z'))).toBe('2026-W35');
    expect(weekIdOf(Date.parse('2026-08-30T16:00:00Z'))).toBe('2026-W36');
  });

  test('ISO 年边界（2026-01-01 为周四：2026 有 53 周）', () => {
    expect(weekIdOf(Date.parse('2025-12-29T00:00:00Z'))).toBe('2026-W01');
    expect(weekIdOf(Date.parse('2025-12-28T00:00:00Z'))).toBe('2025-W52');
    expect(weekIdOf(Date.parse('2027-01-03T00:00:00Z'))).toBe('2026-W53');
    expect(weekIdOf(Date.parse('2027-01-04T00:00:00Z'))).toBe('2027-W01');
  });

  test('previousWeekStartMs：恰好回退 7 天且仍落在周一界', () => {
    const now = Date.parse('2026-08-30T02:00:00Z'); // 周日（W35）
    const previous = previousWeekStartMs(now);
    const start = weekStartMs(now);
    expect(weekIdOf(previous)).toBe('2026-W34');
    expect(weekStartMs(previous)).toBe(previous);
    expect(start - previous).toBe(7 * 86_400_000);
    expect(now - start).toBe(6 * 86_400_000 + 10 * 3_600_000); // 周一 00:00 UTC+8 → 周日 10:00 UTC
  });
});

describe('rankAccent（前三名次圆片，低饱和）', () => {
  test('1/2/3 → 旧金/雾银/木铜，其余无圆片', () => {
    expect(rankAccent(1)).toBe('gold');
    expect(rankAccent(2)).toBe('silver');
    expect(rankAccent(3)).toBe('bronze');
    expect(rankAccent(4)).toBeNull();
    expect(rankAccent(0)).toBeNull();
    expect(rankAccent(-1)).toBeNull();
  });
});

describe('goalProgress', () => {
  test('按目标分钟夹取 0..1', () => {
    expect(goalProgress(0, 600)).toBe(0);
    expect(goalProgress(300, 600)).toBe(0.5);
    expect(goalProgress(700, 600)).toBe(1);
    expect(goalProgress(-5, 600)).toBe(0);
    expect(goalProgress(100, 0)).toBe(0);
  });
});

describe('avatarInitial', () => {
  test('昵称首字符；空白回退；代理对按码位', () => {
    expect(avatarInitial('雨夜')).toBe('雨');
    expect(avatarInitial('  echo ')).toBe('e');
    expect(avatarInitial('🌈study')).toBe('🌈');
    expect(avatarInitial('')).toBe('友');
    expect(avatarInitial('   ')).toBe('友');
  });
});
