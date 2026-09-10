import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  resolvePriceMinor,
  resolveStoreProductId,
} from '../src/features/store/data/order-service';
import type { SkinProductView } from '../src/features/store/data/product-repository';

// Plus 折扣双 SKU 解析（纯逻辑，无 DB）：plusApple/plusGoogle 命中、缺映射
// 回落基础 SKU（折扣是增益不是门槛）、金额口径与选中 SKU 配套。

const product = (overrides: Partial<SkinProductView> = {}): SkinProductView => ({
  id: 'skin-product-midnight-workstation',
  skinId: 'skin-midnight-workstation',
  slug: 'midnight-workstation',
  skinName: '深夜工作台',
  accessType: 'paid',
  entitlementKey: 'skin.official.midnight-workstation',
  storeProductIds: {
    apple: 'tech.zhongbei.loficompanion.theme.midnight',
    google: 'tech.zhongbei.loficompanion.theme.midnight',
    plusApple: 'tech.zhongbei.loficompanion.theme.midnight.plus',
    plusGoogle: 'tech.zhongbei.loficompanion.theme.midnight.plus',
  },
  priceMinor: 99,
  currency: 'USD',
  status: 'active',
  provider: 'store',
  availableFrom: null,
  availableUntil: null,
  plusPriceMinor: 49,
  ...overrides,
});

describe('resolveStoreProductId（Plus 双 SKU）', () => {
  it('plus=true 且配置了 plusApple/plusGoogle → 选中折扣 SKU', () => {
    assert.equal(
      resolveStoreProductId(product(), 'ios', { plus: true }),
      'tech.zhongbei.loficompanion.theme.midnight.plus',
    );
    assert.equal(
      resolveStoreProductId(product(), 'android', { plus: true }),
      'tech.zhongbei.loficompanion.theme.midnight.plus',
    );
  });

  it('plus=false / 未传 → 基础 SKU（行为不变）', () => {
    assert.equal(
      resolveStoreProductId(product(), 'ios'),
      'tech.zhongbei.loficompanion.theme.midnight',
    );
    assert.equal(
      resolveStoreProductId(product(), 'ios', { plus: false }),
      'tech.zhongbei.loficompanion.theme.midnight',
    );
  });

  it('plus=true 但缺折扣 SKU 映射 → 回落基础 SKU（不抛 PRODUCT_NOT_MAPPED）', () => {
    const noPlus = product({ storeProductIds: { apple: 'base.apple' } });
    assert.equal(resolveStoreProductId(noPlus, 'ios', { plus: true }), 'base.apple');
  });

  it('mock 回退商品 id（plus 判定不影响 mock 分支）', () => {
    const mock = product({ provider: 'mock', storeProductIds: {} });
    assert.equal(resolveStoreProductId(mock, 'ios', { plus: true }), mock.id);
  });

  it('缺本平台映射仍抛 PRODUCT_NOT_MAPPED（门禁不变）', () => {
    assert.throws(
      () => resolveStoreProductId(product({ storeProductIds: {} }), 'ios', { plus: true }),
      (error: unknown) => error instanceof Error && (error as { code?: string }).code === 'PRODUCT_NOT_MAPPED',
    );
  });
});

describe('resolvePriceMinor（金额口径）', () => {
  it('plus 且配置折扣价 → plusPriceMinor', () => {
    assert.equal(resolvePriceMinor(product(), { plus: true }), 49);
  });

  it('plus 但未配置折扣价（null）→ 兜底原价', () => {
    assert.equal(resolvePriceMinor(product({ plusPriceMinor: null }), { plus: true }), 99);
  });

  it('非 plus → 恒原价（行为不变）', () => {
    assert.equal(resolvePriceMinor(product()), 99);
    assert.equal(resolvePriceMinor(product(), { plus: false }), 99);
  });
});
