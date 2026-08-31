import { describe, expect, it } from 'vitest';

import { allocateLane, estimateBulletChars } from './danmakuLanes';

// 车道分配：空闲者优先（下标小者），全忙复用最久未起跑者——弹幕不丢。

describe('allocateLane', () => {
  const opts = { laneClearMs: 9000 };

  it('fills lanes bottom-up while all are busy', () => {
    const lanes = [null, null, null];
    expect(allocateLane(lanes, 1000, opts).lane).toBe(0);
    const afterFirst = [{ lastStartMs: 1000 }, null, null];
    expect(allocateLane(afterFirst, 1000, opts).lane).toBe(1);
    const afterSecond = [{ lastStartMs: 1000 }, { lastStartMs: 1000 }, null];
    expect(allocateLane(afterSecond, 1000, opts).lane).toBe(2);
  });

  it('reuses a lane once its clear window has passed', () => {
    const lanes = [{ lastStartMs: 0 }, { lastStartMs: 8000 }, null];
    // lane 0 起跑于 0ms，9000ms 已清空；lane 1 还在滚动
    expect(allocateLane(lanes, 9000, opts).lane).toBe(0);
  });

  it('falls back to the least-recently-started lane when all are busy', () => {
    const lanes = [{ lastStartMs: 5000 }, { lastStartMs: 1000 }, { lastStartMs: 8000 }];
    const result = allocateLane(lanes, 9000, opts);
    expect(result.lane).toBe(1);
    expect(result.slot).toEqual({ lastStartMs: 9000 });
  });

  it('treats an empty lane list defensively', () => {
    expect(allocateLane([], 0, opts).lane).toBe(0);
  });
});

describe('estimateBulletChars', () => {
  it('counts CJK as full-width units', () => {
    expect(estimateBulletChars('一起加油')).toBe(4);
  });

  it('weights latin at 0.55', () => {
    expect(estimateBulletChars('abcd')).toBeCloseTo(2.2);
  });

  it('counts emoji (astral plane) as full-width single units', () => {
    expect(estimateBulletChars('🎓')).toBe(1);
    expect(estimateBulletChars('加油！🎓')).toBe(4);
  });

  it('never returns below 1', () => {
    expect(estimateBulletChars('')).toBe(1);
  });
});
