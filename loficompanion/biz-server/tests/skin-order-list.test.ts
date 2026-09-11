import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  pickStoreProductId,
  toSkinOrderView,
} from '../src/features/store/data/order-service';
import type { SkinOrderRow } from '../src/features/store/data/order-repository';
import type { SkinProductView } from '../src/features/store/data/product-repository';

// 订单中心列表装配（纯逻辑，无 DB）：toSkinOrderView 全字段映射 + 历史 SKU
// 真源优先 / mock 回显 / 目录降级。DB 装配事务纪律由 Prisma 保证（仓库惯例
// 不做 DB 测试）。

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

const order = (overrides: Partial<SkinOrderRow> = {}): SkinOrderRow => ({
  id: 'order-1',
  user_id: 'u1',
  skin_id: 'skin-midnight-workstation',
  entitlement_key: 'skin.official.midnight-workstation',
  idempotency_key: 'k1',
  amount_minor: 49,
  currency: 'USD',
  provider: 'store',
  store_product_id: '',
  status: 'success',
  store_transaction_id: '',
  receipt_hash: '',
  created_at: '2026-09-10T12:00:00.000Z',
  completed_at: '2026-09-10T12:00:01.000Z',
  ...overrides,
} as SkinOrderRow);

describe('toSkinOrderView（列表线格式）', () => {
  it('全字段映射：金额取订单行（历史真源）、状态透传、entitled 透传', () => {
    const view = toSkinOrderView(
      order({ amount_minor: 49, status: 'failed', completed_at: null }),
      product(),
      product().slug,
      'tech.zhongbei.loficompanion.theme.midnight',
      false,
    );
    assert.equal(view.orderId, 'order-1');
    assert.equal(view.skinId, 'skin-midnight-workstation');
    assert.equal(view.slug, 'midnight-workstation');
    assert.equal(view.entitlementKey, 'skin.official.midnight-workstation');
    assert.equal(view.priceMinor, 49);
    assert.equal(view.currency, 'USD');
    assert.equal(view.status, 'failed');
    assert.equal(view.provider, 'store');
    assert.equal(view.storeProductId, 'tech.zhongbei.loficompanion.theme.midnight');
    assert.equal(view.createdAt, '2026-09-10T12:00:00.000Z');
    assert.equal(view.completedAt, null);
    assert.equal(view.entitled, false);
  });
});

describe('pickStoreProductId（历史 SKU 装配）', () => {
  it('订单行已存 SKU 优先（历史真源；不随目录/平台重算）', () => {
    const stored = order({ store_product_id: 'legacy.sku' });
    assert.equal(
      pickStoreProductId(stored, product({ storeProductIds: {} }), 'ios'),
      'legacy.sku',
    );
  });

  it('空行 + mock 商品 → 回显商品 id（MockPaymentProvider 票据约定）', () => {
    const mock = product({ provider: 'mock' });
    assert.equal(pickStoreProductId(order(), mock, 'ios'), mock.id);
  });

  it('空行 + store 商品 → 按当前目录解析本平台 SKU', () => {
    assert.equal(
      pickStoreProductId(order(), product(), 'android'),
      'tech.zhongbei.loficompanion.theme.midnight',
    );
  });

  it('空行 + 目录缺本平台映射 → 降级空串（展示降级，不抛 PRODUCT_NOT_MAPPED）', () => {
    assert.equal(pickStoreProductId(order(), product({ storeProductIds: {} }), 'ios'), '');
  });
});
