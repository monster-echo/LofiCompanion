/**
 * 皮肤域 zh-CN 文案常量（doc-08 §2 S01）。
 */

export const SKIN_STRINGS = {
  galleryTitle: '选择陪伴皮肤',
  applySkin: '使用这套皮肤',
  comingSoon: '即将推出',
  freeCount: (n: number) => `${n} 套免费可用`,
  skinEntry: '选择陪伴皮肤',
} as const;

/** P0-A 占位皮肤（未接入清单，仅展示「即将推出」，不可选） */
export const UPCOMING_SKINS: readonly { id: string; name: string }[] = [
  { id: 'sunny-classroom', name: '阳光教室' },
  { id: 'late-night-desk', name: '深夜工作台' },
];
