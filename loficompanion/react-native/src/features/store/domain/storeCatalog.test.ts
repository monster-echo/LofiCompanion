import { describe, expect, it } from 'vitest';
import type { SkinProductRemote } from '../../../data/apiClient';
import {
  buildStoreSections,
  formatPrice,
  newSkinOrderIdempotencyKey,
  ownedCardCount,
  resolveRecovery,
  type LocalSkinInfo,
} from './storeCatalog';

const LOCAL: LocalSkinInfo = {
  id: 'rainy-study-room-v1',
  slug: 'rainy-study-room',
  name: '雨夜书房',
  stateCount: 6,
};

const CLOUD_SUNNY: LocalSkinInfo = {
  id: 'sunny-classroom-v2',
  slug: 'sunny-classroom',
  name: 'Sunny Classroom',
  stateCount: 6,
};

function product(overrides: Partial<SkinProductRemote>): SkinProductRemote {
  return {
    id: 'skin-product-x',
    skinId: 'skin-x',
    slug: 'x',
    skinName: 'X',
    accessType: 'paid',
    entitlementKey: 'skin.official.x',
    storeProductIds: {},
    priceMinor: 1200,
    currency: 'CNY',
    status: 'active',
    ...overrides,
  };
}

// 生产形态（docs/05 §8）：深夜工作台 $0.99 单买，IAP 商品 ID 双端同配
const MIDNIGHT = product({
  id: 'skin-product-midnight-workstation',
  skinId: 'skin-midnight-workstation',
  slug: 'midnight-workstation',
  skinName: '深夜工作台',
  accessType: 'paid',
  entitlementKey: 'skin.official.midnight-workstation',
  storeProductIds: {
    apple: 'tech.zhongbei.loficompanion.theme.midnight',
    google: 'tech.zhongbei.loficompanion.theme.midnight',
  },
  priceMinor: 99,
  currency: 'USD',
});

const PREMIUM_PACK = product({
  id: 'skin-product-plus-pack',
  skinId: 'skin-plus-pack',
  slug: 'plus-pack',
  skinName: 'Plus 精选包',
  accessType: 'premium',
  entitlementKey: 'catalog.premium.active',
  priceMinor: 1800,
});

describe('formatPrice', () => {
  it('整数分不显示小数（¥12）', () => {
    expect(formatPrice(1200, 'CNY')).toBe('¥12');
  });

  it('非整数分保留两位（¥12.50）', () => {
    expect(formatPrice(1250, 'CNY')).toBe('¥12.50');
  });

  it('USD 用 $ 符号（$0.99 单买皮肤）', () => {
    expect(formatPrice(99, 'USD')).toBe('$0.99');
    expect(formatPrice(990, 'USD')).toBe('$9.90');
  });

  it('其他币种带 ISO 码前缀', () => {
    expect(formatPrice(450, 'EUR')).toBe('EUR 4.50');
  });
});

describe('buildStoreSections', () => {
  it('三分区：本地清单免费皮肤排首位，付费/Plus 按服务端目录', () => {
    const sections = buildStoreSections({
      products: [MIDNIGHT, PREMIUM_PACK],
      localSkins: [LOCAL, CLOUD_SUNNY],
      ownedKeys: [],
      selectedSkinSlug: 'rainy-study-room',
    });
    expect(sections.free.map((c) => c.slug)).toEqual(['rainy-study-room', 'sunny-classroom']);
    expect(sections.paid.map((c) => c.slug)).toEqual(['midnight-workstation']);
    expect(sections.premium.map((c) => c.slug)).toEqual(['plus-pack']);
  });

  it('付费皮肤（深夜工作台）走服务端商品行：paid 分区 + 权益键判拥有 + $0.99 价签', () => {
    // 生产形态：localSkins 只传免费皮肤（内置默认 + 已拉取云端免费）；midnight
    // 由商品行进「永久购买」区，价格与权益判定以服务端为唯一来源
    const sections = buildStoreSections({
      products: [MIDNIGHT],
      localSkins: [LOCAL],
      ownedKeys: ['skin.official.midnight-workstation'],
      selectedSkinSlug: 'rainy-study-room',
    });
    expect(sections.paid.map((c) => c.slug)).toEqual(['midnight-workstation']);
    expect(sections.paid[0]).toMatchObject({ owned: true, priceLabel: '$0.99' });
    expect(sections.free.map((c) => c.slug)).toEqual(['rainy-study-room']);
  });

  it('stateCountFor 命中真实状态数；未命中为 null（卡片隐藏状态行）', () => {
    const sections = buildStoreSections({
      products: [MIDNIGHT],
      localSkins: [LOCAL],
      ownedKeys: [],
      selectedSkinSlug: '',
      stateCountFor: (slug) => (slug === 'midnight-workstation' ? 6 : undefined),
    });
    expect(sections.paid[0]!.stateCount).toBe(6);
    expect(sections.free[0]!.stateCount).toBe(6); // 本地清单自带
    const unknown = buildStoreSections({
      products: [MIDNIGHT],
      localSkins: [],
      ownedKeys: [],
      selectedSkinSlug: '',
    });
    expect(unknown.paid[0]!.stateCount).toBeNull();
  });

  it('免费皮肤始终已拥有且无价格标签；付费卡价格来自服务端', () => {
    const sections = buildStoreSections({
      products: [MIDNIGHT],
      localSkins: [LOCAL],
      ownedKeys: [],
      selectedSkinSlug: 'rainy-study-room',
    });
    expect(sections.free[0]).toMatchObject({ owned: true, inUse: true, priceLabel: null });
    expect(sections.paid[0]).toMatchObject({ owned: false, priceLabel: '$0.99' });
  });

  it('Plus 目录卡不带价格标签（Plus 徽标由 UI 渲染，避免误导性标价）', () => {
    const sections = buildStoreSections({
      products: [PREMIUM_PACK],
      localSkins: [LOCAL],
      ownedKeys: [],
      selectedSkinSlug: '',
    });
    expect(sections.premium[0]!.priceLabel).toBeNull();
    expect(sections.premium[0]!.owned).toBe(false);
  });

  it('未登录（ownedKeys 空）仅本地免费皮肤已拥有；权益键命中即已拥有', () => {
    const guest = buildStoreSections({
      products: [MIDNIGHT, PREMIUM_PACK],
      localSkins: [LOCAL],
      ownedKeys: [],
      selectedSkinSlug: '',
    });
    expect(guest.paid[0]!.owned).toBe(false);
    expect(guest.premium[0]!.owned).toBe(false);

    const owner = buildStoreSections({
      products: [MIDNIGHT, PREMIUM_PACK],
      localSkins: [LOCAL],
      ownedKeys: ['skin.official.midnight-workstation'],
      selectedSkinSlug: '',
    });
    expect(owner.paid[0]!.owned).toBe(true);
    expect(owner.premium[0]!.owned).toBe(false);
  });

  it('使用中标记跟随本地选择；已拥有计数含免费卡', () => {
    const sections = buildStoreSections({
      products: [MIDNIGHT],
      localSkins: [LOCAL],
      ownedKeys: ['skin.official.midnight-workstation'],
      selectedSkinSlug: 'rainy-study-room',
    });
    expect(sections.free[0]!.inUse).toBe(true);
    expect(sections.paid[0]!.inUse).toBe(false);
    expect(ownedCardCount(sections)).toBe(2);
  });
});

describe('resolveRecovery（docs/05 §5 中断恢复终态判据）', () => {
  it('success 或权益已生效 → unlocked', () => {
    expect(resolveRecovery({ status: 'success', entitled: false })).toBe('unlocked');
    expect(resolveRecovery({ status: 'processing', entitled: true })).toBe('unlocked');
  });

  it('failed/refunded → failed（清除记录可重新购买）', () => {
    expect(resolveRecovery({ status: 'failed', entitled: false })).toBe('failed');
    expect(resolveRecovery({ status: 'refunded', entitled: false })).toBe('failed');
  });

  it('pending/processing 且无权益 → 继续轮询', () => {
    expect(resolveRecovery({ status: 'pending', entitled: false })).toBe('keepWaiting');
    expect(resolveRecovery({ status: 'processing', entitled: false })).toBe('keepWaiting');
  });
});

describe('newSkinOrderIdempotencyKey', () => {
  it('uuid v4 形态且不重复', () => {
    const a = newSkinOrderIdempotencyKey();
    const b = newSkinOrderIdempotencyKey();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a).not.toBe(b);
  });
});
