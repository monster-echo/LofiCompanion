// 弹幕车道分配（纯函数，node 可测）：新子弹落位到「上一发已基本驶离」的
// 车道；全部车道忙碌时复用最久未起跑的车道——弹幕绝不静默丢弃，只是
// 允许追尾（与 B 站弹幕行为一致）。

export interface LaneSlot {
  /** 该车道最近一次起跑时刻（ms） */
  lastStartMs: number;
}

export interface LaneOptions {
  /** 车道清空时长（ms）：距上次起跑超过此时长视为空闲（≈滚动时长） */
  laneClearMs: number;
}

/**
 * 分配车道：优先取第一个空闲车道（下标小者优先，视觉自上而下填充）；
 * 无空闲时取 lastStartMs 最小的车道。
 */
export function allocateLane(
  lanes: readonly (LaneSlot | null)[],
  nowMs: number,
  opts: LaneOptions,
): { lane: number; slot: LaneSlot } {
  let fallbackLane = -1;
  let fallbackStartMs = Number.POSITIVE_INFINITY;
  for (let i = 0; i < lanes.length; i += 1) {
    const slot = lanes[i];
    if (slot === null || nowMs - slot.lastStartMs >= opts.laneClearMs) {
      return { lane: i, slot: { lastStartMs: nowMs } };
    }
    if (slot.lastStartMs < fallbackStartMs) {
      fallbackStartMs = slot.lastStartMs;
      fallbackLane = i;
    }
  }
  return { lane: fallbackLane >= 0 ? fallbackLane : 0, slot: { lastStartMs: nowMs } };
}

/**
 * 弹幕宽度估算（以「全角字」为单位）：CJK/全角/扩展平面（emoji）计 1，
 * 拉丁/半角计 0.55；驱动动画时长与车道间距，无需真实测量 Text 宽度。
 */
export function estimateBulletChars(content: string): number {
  let units = 0;
  for (const ch of content) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x2e80) units += 1;
    else units += 0.55;
  }
  return Math.max(1, units);
}
