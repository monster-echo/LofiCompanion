import { describe, expect, it } from 'vitest';
import {
  abandonSession,
  completeSession,
  deriveOnLaunch,
  effectiveSeconds,
  pauseSession,
  remainingSeconds,
  resumeSession,
} from './engine';
import {
  DEFAULT_ACTIVITY,
  DEFAULT_DURATION,
  QUICK_DURATIONS,
  validateCustomDuration,
} from './validate';
import type { FocusSessionDoc } from './types';

const SEC = 1000;
const T0 = 1_700_000_000_000; // 固定起点（UTC ms），全程无 Date.now()

function doc(overrides: Partial<FocusSessionDoc> = {}): FocusSessionDoc {
  return {
    id: 's1',
    clientRequestId: 'req-1',
    activity: 'homework',
    plannedSeconds: 1800, // 30 分钟
    status: 'active',
    startedAtUtc: T0,
    pauses: [],
    docVersion: 1,
    ...overrides,
  };
}

describe('区间推导', () => {
  it('有效秒数 = 墙钟 − 暂停区间', () => {
    const d = doc({ pauses: [{ start: T0 + 600 * SEC, end: T0 + 720 * SEC }] });
    expect(effectiveSeconds(d, T0 + 1000 * SEC)).toBe(880); // 1000 − 120
  });

  it('多段暂停区间求和', () => {
    const d = doc({
      pauses: [
        { start: T0 + 100 * SEC, end: T0 + 160 * SEC }, // 60s
        { start: T0 + 300 * SEC, end: T0 + 400 * SEC }, // 100s
      ],
    });
    expect(effectiveSeconds(d, T0 + 1000 * SEC)).toBe(840); // 1000 − 160
  });

  it('暂停中有效秒数冻结（时钟不走）', () => {
    const p = pauseSession(doc(), T0 + 600 * SEC);
    expect(effectiveSeconds(p, T0 + 600 * SEC)).toBe(600);
    expect(effectiveSeconds(p, T0 + 900 * SEC)).toBe(600);
  });

  it('负值钳为 0；完成/放弃后的 now 不再多计', () => {
    expect(effectiveSeconds(doc(), T0 - 5 * SEC)).toBe(0);
    const c = completeSession(doc(), T0 + 500 * SEC);
    expect(effectiveSeconds(c, T0 + 500_000 * SEC)).toBe(500);
  });

  it('剩余秒数 = 计划 − 有效，超时钳为 0', () => {
    expect(remainingSeconds(doc(), T0 + 1000 * SEC)).toBe(800);
    expect(remainingSeconds(doc(), T0 + 2000 * SEC)).toBe(0);
  });
});

describe('幂等操作', () => {
  it('双重暂停：不加第二个区间，返回同一文档', () => {
    const p1 = pauseSession(doc(), T0);
    const p2 = pauseSession(p1, T0 + 10 * SEC);
    expect(p2).toBe(p1);
    expect(p1.status).toBe('paused');
    expect(p1.pauses).toEqual([{ start: T0, end: T0 }]);
  });

  it('双重继续：第二次返回原文档，区间保持首段闭合值', () => {
    const p = pauseSession(doc(), T0);
    const r1 = resumeSession(p, T0 + 120 * SEC);
    const r2 = resumeSession(r1, T0 + 500 * SEC);
    expect(r2).toBe(r1);
    expect(r1.status).toBe('active');
    expect(r1.pauses).toEqual([{ start: T0, end: T0 + 120 * SEC }]);
  });

  it('active 上继续、terminal 上暂停均原文返回', () => {
    const d = doc();
    expect(resumeSession(d, T0)).toBe(d);
    const c = completeSession(doc(), T0 + 10 * SEC);
    expect(pauseSession(c, T0 + 20 * SEC)).toBe(c);
  });

  it('暂停中完成：先闭合区间再落完成时刻', () => {
    const p = pauseSession(doc(), T0 + 600 * SEC);
    const c = completeSession(p, T0 + 660 * SEC);
    expect(c.status).toBe('completed');
    expect(c.completedAtUtc).toBe(T0 + 660 * SEC);
    expect(c.pauses).toEqual([{ start: T0 + 600 * SEC, end: T0 + 660 * SEC }]);
  });

  it('terminal 文档上的一切操作深度不变', () => {
    const c = completeSession(doc(), T0 + 500 * SEC);
    const a = abandonSession(doc(), T0 + 500 * SEC);
    expect(completeSession(c, T0 + 900 * SEC)).toBe(c);
    expect(abandonSession(c, T0 + 900 * SEC)).toBe(c);
    expect(completeSession(a, T0 + 900 * SEC)).toBe(a);
    expect(abandonSession(a, T0 + 900 * SEC)).toBe(a);
    expect(pauseSession(a, T0 + 900 * SEC)).toBe(a);
  });

  it('放弃后按 abandonedAtUtc 截断有效秒数', () => {
    const a = abandonSession(doc(), T0 + 300 * SEC);
    expect(a.status).toBe('abandoned');
    expect(a.abandonedAtUtc).toBe(T0 + 300 * SEC);
    expect(effectiveSeconds(a, T0 + 900 * SEC)).toBe(300);
  });

  it('纯函数：操作不改写入参文档', () => {
    const d = doc();
    pauseSession(d, T0);
    expect(d.status).toBe('active');
    expect(d.pauses).toHaveLength(0);
  });
});

describe('强杀恢复', () => {
  it('暂停 120s 后强杀，1000s 后重启：有效秒数误差 ≤1s', () => {
    let d = doc({ plannedSeconds: 1800 });
    d = pauseSession(d, T0 + 600 * SEC);
    d = resumeSession(d, T0 + 720 * SEC); // 暂停 120s
    const relaunchAt = T0 + 720 * SEC + 1000 * SEC;
    const expected = 600 + 1000; // 暂停前有效 + 恢复后墙钟
    const actual = effectiveSeconds(d, relaunchAt);
    expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1);
    expect(actual).toBe(1600);
    // 未越过计划终点，保持 active 原样
    expect(deriveOnLaunch(d, relaunchAt)).toBe(d);
  });

  it('越过计划终点自动完成，completedAtUtc 为精确推导时刻（非 now）', () => {
    const d = doc({ plannedSeconds: 60 });
    const r = deriveOnLaunch(d, T0 + 65 * SEC);
    expect(r.status).toBe('completed');
    expect(r.completedAtUtc).toBe(T0 + 60 * SEC);
    expect(effectiveSeconds(r, T0 + 65 * SEC)).toBe(60);
  });

  it('含暂停的自动完成：完成时刻 = 开始 + 计划 + 暂停', () => {
    const d = doc({
      plannedSeconds: 60,
      pauses: [{ start: T0 + 20 * SEC, end: T0 + 30 * SEC }], // 暂停 10s
    });
    const r = deriveOnLaunch(d, T0 + 71 * SEC); // 有效 61s ≥ 60s
    expect(r.status).toBe('completed');
    expect(r.completedAtUtc).toBe(T0 + 70 * SEC); // 60 + 10
  });

  it('暂停中文档永不自动完成', () => {
    const d = pauseSession(doc({ plannedSeconds: 60 }), T0 + 30 * SEC);
    const r = deriveOnLaunch(d, T0 + 120 * SEC); // 墙钟早已越过计划终点
    expect(r).toBe(d);
    expect(r.status).toBe('paused');
    expect(r.completedAtUtc).toBeUndefined();
  });

  it('未到期恢复不误完成；terminal 文档原样返回', () => {
    const d = doc({ plannedSeconds: 1800 });
    expect(deriveOnLaunch(d, T0 + 1000 * SEC)).toBe(d);
    const c = completeSession(doc(), T0 + 500 * SEC);
    expect(deriveOnLaunch(c, T0 + 900_000 * SEC)).toBe(c);
  });
});

describe('输入校验', () => {
  it('自定义时长边界：4→null, 5→5, 180→180, 181→null, 25.5→null', () => {
    expect(validateCustomDuration(4)).toBeNull();
    expect(validateCustomDuration(5)).toBe(5);
    expect(validateCustomDuration(180)).toBe(180);
    expect(validateCustomDuration(181)).toBeNull();
    expect(validateCustomDuration(25.5)).toBeNull();
  });

  it('非有限数拒绝；默认值与快捷时长符合 doc-01 §5.3', () => {
    expect(validateCustomDuration(Number.NaN)).toBeNull();
    expect(validateCustomDuration(Number.POSITIVE_INFINITY)).toBeNull();
    expect(DEFAULT_ACTIVITY).toBe('homework');
    expect(DEFAULT_DURATION).toBe(25);
    expect(QUICK_DURATIONS).toEqual([15, 25, 45, 60]);
  });
});
