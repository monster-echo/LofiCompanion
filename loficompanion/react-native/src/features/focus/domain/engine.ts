import type { FocusSessionDoc, PauseInterval } from './types';

/**
 * 计时域纯函数：全部以文档为输入、返回新文档（不改入参），`now` 一律是
 * 参数——绝不调用 Date.now()。后台/强杀恢复只靠时间戳与暂停区间推导。
 */

function lastInterval(doc: FocusSessionDoc): PauseInterval | undefined {
  return doc.pauses[doc.pauses.length - 1];
}

/** 开放区间 = 处于 paused 且最后一段仍为占位闭合（end===start）。 */
function openInterval(doc: FocusSessionDoc): PauseInterval | null {
  if (doc.status !== 'paused') return null;
  const last = lastInterval(doc);
  return last && last.end === last.start ? last : null;
}

/** 关闭最后一段（resume/complete/abandon 时调用）。返回新数组，不改入参。 */
function closeLast(pauses: PauseInterval[], now: number): PauseInterval[] {
  const last = pauses[pauses.length - 1];
  if (!last) return pauses;
  return [...pauses.slice(0, -1), { start: last.start, end: now }];
}

/** 累计暂停时长；open 非空时该区间按 now 展开（暂停中时钟冻结）。 */
function pausedMs(doc: FocusSessionDoc, now: number, open: PauseInterval | null): number {
  let total = 0;
  for (const p of doc.pauses) {
    const end = p === open ? now : p.end;
    total += Math.max(0, end - p.start);
  }
  return total;
}

/** 已闭合区间的暂停总和（不含未闭合的开放区间）。 */
function closedPausedMs(doc: FocusSessionDoc): number {
  let total = 0;
  for (const p of doc.pauses) {
    total += Math.max(0, p.end - p.start);
  }
  return total;
}

/** 有效专注秒数：墙钟减全部暂停，向下取整，绝不小于 0。 */
export function effectiveSeconds(doc: FocusSessionDoc, now: number): number {
  const end = doc.completedAtUtc ?? doc.abandonedAtUtc ?? now;
  const wallMs = Math.max(0, Math.min(now, end) - doc.startedAtUtc);
  const paused = pausedMs(doc, now, openInterval(doc));
  return Math.max(0, Math.floor((wallMs - paused) / 1000));
}

/** 剩余秒数（active/paused 语义），超时钳为 0。 */
export function remainingSeconds(doc: FocusSessionDoc, now: number): number {
  return Math.max(0, doc.plannedSeconds - effectiveSeconds(doc, now));
}

/** 暂停：仅 active 可暂停；重复暂停或对已结束文档幂等返回原文档。 */
export function pauseSession(doc: FocusSessionDoc, now: number): FocusSessionDoc {
  if (doc.status !== 'active') return doc;
  return {
    ...doc,
    status: 'paused',
    pauses: [...doc.pauses, { start: now, end: now }],
  };
}

/** 继续：仅 paused 可继续（闭合最后一段）；其余情况幂等返回原文档。 */
export function resumeSession(doc: FocusSessionDoc, now: number): FocusSessionDoc {
  if (doc.status !== 'paused' || doc.pauses.length === 0) return doc;
  return { ...doc, status: 'active', pauses: closeLast(doc.pauses, now) };
}

/** 提前/正常完成：暂停中先闭合区间；对已结束文档幂等返回原文档。 */
export function completeSession(doc: FocusSessionDoc, now: number): FocusSessionDoc {
  if (doc.status === 'completed' || doc.status === 'abandoned') return doc;
  const pauses = doc.status === 'paused' ? closeLast(doc.pauses, now) : doc.pauses;
  return { ...doc, status: 'completed', pauses, completedAtUtc: now };
}

/** 放弃：同 complete，落 abandonedAtUtc；对已结束文档幂等返回原文档。 */
export function abandonSession(doc: FocusSessionDoc, now: number): FocusSessionDoc {
  if (doc.status === 'completed' || doc.status === 'abandoned') return doc;
  const pauses = doc.status === 'paused' ? closeLast(doc.pauses, now) : doc.pauses;
  return { ...doc, status: 'abandoned', pauses, abandonedAtUtc: now };
}

/**
 * 启动时强杀恢复：active 文档若已越过计划终点（墙钟减已闭合暂停 ≥ 计划
 * 时长），按精确时刻自动完成——completedAtUtc = 开始 + 计划 + 暂停，
 * 绝不用 now，保证恢复后误差 ≤1s。暂停中文档专注时钟不走，保持暂停；
 * 已结束文档原样返回。
 */
export function deriveOnLaunch(doc: FocusSessionDoc, now: number): FocusSessionDoc {
  if (doc.status === 'completed' || doc.status === 'abandoned') return doc;
  if (doc.status === 'paused') return doc;
  const pausesMs = closedPausedMs(doc);
  if (now - doc.startedAtUtc - pausesMs >= doc.plannedSeconds * 1000) {
    return completeSession(doc, doc.startedAtUtc + doc.plannedSeconds * 1000 + pausesMs);
  }
  return doc;
}
