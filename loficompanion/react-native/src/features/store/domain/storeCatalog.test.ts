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

const SUNNY = product({
  id: 'skin-product-sunny-classroom',
  skinId: 'skin-sunny-classroom',
  slug: 'sunny-classroom',
  skinName: '阳光教室',
  accessType: 'paid',
  entitlementKey: 'skin.official.sunny-classroom',
  priceMinor: 1200,
});

const MIDNIGHT = product({
  id: 'skin-product-midnight-workstation',
  skinId: 'skin-midnight-workstation',
  slug: 'midnight-workstation',
  skinName: '深夜工作台',
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

  it('非 CNY 币种带币种前缀', () => {
    expect(formatPrice(990, 'USD')).toBe('USD 9.90');
  });
});

describe('buildStoreSections', () => {
  it('三分区：本地免费皮肤排首位，付费/Plus 按服务端目录', () => {
    const sections = buildStoreSections({
      products: [SUNNY, MIDNIGHT],
      localSkins: [LOCAL],
      ownedKeys: [],
      selectedSkinSlug: 'rainy-study-room',
    });
    expect(sections.free.map((c) => c.slug)).toEqual(['rainy-study-room']);
    expect(sections.paid.map((c) => c.slug)).toEqual(['sunny-classroom']);
    expect(sections.premium.map((c) => c.slug)).toEqual(['midnight-workstation']);
  });

  it('多套本地内置皮肤按序排在免费区头部（doc-01 PRD：三套全免费）', () => {
    const sections = buildStoreSections({
      products: [],
      localSkins: [
        LOCAL,
        { id: 'sunny-classroom-v1', slug: 'sunny-classroom', name: '阳光教室', stateCount: 6 },
        { id: 'midnight-workstation-v1', slug: 'midnight-workstation', name: '深夜工作台', stateCount: 6 },
      ],
      ownedKeys: [],
      selectedSkinSlug: 'sunny-classroom',
    });
    expect(sections.free.map((c) => c.slug)).toEqual([
      'rainy-study-room',
      'sunny-classroom',
      'midnight-workstation',
    ]);
    expect(sections.free[1]).toMatchObject({ owned: true, inUse: true, priceLabel: null });
    expect(sections.paid).toEqual([]);
    expect(sections.premium).toEqual([]);
  });

  it('免费皮肤始终已拥有且无价格标签；付费卡价格来自服务端（¥12）', () => {
    const sections = buildStoreSections({
      products: [SUNNY],
      localSkins: [LOCAL],
      ownedKeys: [],
      selectedSkinSlug: 'rainy-study-room',
    });
    expect(sections.free[0]).toMatchObject({ owned: true, inUse: true, priceLabel: null });
    expect(sections.paid[0]).toMatchObject({ owned: false, priceLabel: '¥12' });
  });

  it('Plus 目录卡不带价格标签（Plus 徽标由 UI 渲染，避免误导性标价）', () => {
    const sections = buildStoreSections({
      products: [MIDNIGHT],
      localSkins: [LOCAL],
      ownedKeys: [],
      selectedSkinSlug: '',
    });
    expect(sections.premium[0]!.priceLabel).toBeNull();
    expect(sections.premium[0]!.owned).toBe(false);
  });

  it('未登录（ownedKeys 空）仅本地免费皮肤已拥有；权益键命中即已拥有', () => {
    const guest = buildStoreSections({
      products: [SUNNY, MIDNIGHT],
      localSkins: [LOCAL],
      ownedKeys: [],
      selectedSkinSlug: '',
    });
    expect(guest.paid[0]!.owned).toBe(false);
    expect(guest.premium[0]!.owned).toBe(false);

    const owner = buildStoreSections({
      products: [SUNNY, MIDNIGHT],
      localSkins: [LOCAL],
      ownedKeys: ['skin.official.sunny-classroom'],
      selectedSkinSlug: '',
    });
    expect(owner.paid[0]!.owned).toBe(true);
    expect(owner.premium[0]!.owned).toBe(false);
  });

  it('使用中标记跟随本地选择；已拥有计数含免费卡', () => {
    const sections = buildStoreSections({
      products: [SUNNY],
      localSkins: [LOCAL],
      ownedKeys: ['skin.official.sunny-classroom'],
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
