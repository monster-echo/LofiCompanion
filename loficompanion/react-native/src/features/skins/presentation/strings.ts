/**
 * 皮肤域 zh-CN 文案常量（doc-08 §2 S01）。
 */

export const SKIN_STRINGS = {
  galleryTitle: '选择陪伴皮肤',
  applySkin: '使用这套皮肤',
  comingSoon: '即将推出',
  freeCount: (n: number) => `${n} 套免费可用`,
  skinEntry: '选择陪伴皮肤',
  /** 未拥有的付费皮肤：主 CTA 引导到商店详情解锁（doc-08 §2 价格胶囊） */
  unlockCta: '去解锁',
  plusBadge: 'Plus',
  /** 首页右上角快切（doc-08 §3）：环绕切换上一套/下一套内置皮肤 */
  prevSkin: '上一套皮肤',
  nextSkin: '下一套皮肤',
} as const;
