import { describe, expect, it } from 'vitest';
import type { CompletedSession } from './rules';
import { ACHIEVEMENT_DEFS, evaluateGrants, rewardFor } from './rules';

const DAY_MS = 86_400_000;
// 2026-08-01 上海正午（= 04:00 UTC）；day(i) = 之后第 i 个上海自然日
const BASE = Date.UTC(2026, 7, 1, 4, 0);
const day = (i: number): number => BASE + i * DAY_MS;
const NOW = day(30); // 评估时刻远在所有会话之后

function session(completedAtUtc: number, effectiveSeconds = 1500): CompletedSession {
  return { activity: 'homework', effectiveSeconds, completedAtUtc };
}

describe('成就规则', () => {
  it('空历史：不授予任何成就', () => {
    expect(evaluateGrants([], [], NOW)).toEqual([]);
  });

  it('first_focus：1 次会话即触发', () => {
    expect(evaluateGrants([session(day(0))], [], NOW)).toEqual(['first_focus']);
  });

  it('alreadyGranted 过滤：已授予的不再出现在结果里', () => {
    expect(evaluateGrants([session(day(0))], ['first_focus'], NOW)).toEqual([]);
  });

  it('rainy_10h 边界：35999s 不授予，36000s 授予', () => {
    const two = (sec: number) => [session(day(0), sec), session(day(1), 0)];
    expect(evaluateGrants(two(35_999), ['first_focus'], NOW)).toEqual([]);
    expect(evaluateGrants(two(36_000), ['first_focus'], NOW)).toEqual(['rainy_10h']);
  });

  it('sessions_100 边界：99 次不授予，100 次授予', () => {
    // 每次仅 100s，避免总量顺带触发 rainy_10h
    const many = (n: number) => Array.from({ length: n }, (_, i) => session(day(i % 5), 100));
    expect(evaluateGrants(many(99), ['first_focus'], NOW)).toEqual([]);
    expect(evaluateGrants(many(100), ['first_focus'], NOW)).toEqual(['sessions_100']);
  });

  it('streak_7 边界：连续 6 个上海自然日不授予，7 日授予', () => {
    const run = (n: number) => Array.from({ length: n }, (_, i) => session(day(i)));
    expect(evaluateGrants(run(6), ['first_focus'], NOW)).toEqual([]);
    expect(evaluateGrants(run(7), ['first_focus'], NOW)).toEqual(['streak_7']);
  });

  it('同一上海自然日多次会话只算一天：同日 7 次不构成连续七天', () => {
    const sameDay = Array.from({ length: 7 }, (_, i) => session(day(0) + i * 60_000));
    expect(evaluateGrants(sameDay, ['first_focus'], NOW)).toEqual([]);
  });

  it('中断即重置：曾有七天连击，断档后只剩 1 天 → 不误授予', () => {
    const history = [
      ...Array.from({ length: 7 }, (_, i) => session(day(i))), // 旧连击
      session(day(20)), // 断档后仅 1 天
    ];
    expect(evaluateGrants(history, ['first_focus'], NOW)).toEqual([]);
  });

  it('连击不要求包含 now：最近会话距今 2 天，7 日连击仍授予', () => {
    const history = Array.from({ length: 7 }, (_, i) => session(day(i)));
    expect(evaluateGrants(history, ['first_focus'], day(9))).toEqual(['streak_7']);
  });

  it('UTC+8 日界：15:59:59Z 属当日，16:00:00Z 属次日（上海）', () => {
    const six = Array.from({ length: 6 }, (_, i) => session(day(i))); // 08-01..08-06
    // 2026-08-06 16:00:00Z = 上海 08-07 00:00 → 第 7 天
    const nextDayStart = Date.UTC(2026, 7, 6, 16, 0, 0);
    expect(evaluateGrants([...six, session(nextDayStart)], ['first_focus'], NOW)).toEqual([
      'streak_7',
    ]);
    // 1 秒前 = 上海 08-06 23:59:59，仍是第 6 天 → 不足 7 天
    const sameDayEnd = Date.UTC(2026, 7, 6, 15, 59, 59);
    expect(evaluateGrants([...six, session(sameDayEnd)], ['first_focus'], NOW)).toEqual([]);
  });

  it('一次全触发：按定义顺序输出且去重', () => {
    const history = Array.from({ length: 100 }, (_, i) =>
      session(day(i % 7), 400), // 400s × 100 = 40000s ≥ 10h；覆盖 7 个上海自然日
    );
    expect(evaluateGrants(history, [], NOW)).toEqual([
      'first_focus',
      'streak_7',
      'rainy_10h',
      'sessions_100',
    ]);
    // alreadyGranted 传重复项也不影响（防御性去重）
    expect(evaluateGrants(history, ['first_focus', 'first_focus'], NOW)).toEqual([
      'streak_7',
      'rainy_10h',
      'sessions_100',
    ]);
  });

  it('收藏物映射固定：四种规则对应四个房间收藏物', () => {
    expect(ACHIEVEMENT_DEFS.map((d) => [d.ruleKey, d.rewardItemId, d.name, d.ruleVersion]))
      .toEqual([
        ['first_focus', 'bookmark', '第一次专注', 1],
        ['streak_7', 'lamp', '连续七天', 1],
        ['rainy_10h', 'plant', '雨夜十小时', 1],
        ['sessions_100', 'group_photo', '百轮学习', 1],
      ]);
    for (const def of ACHIEVEMENT_DEFS) {
      expect(rewardFor(def.ruleKey)).toBe(def.rewardItemId);
    }
  });
});
