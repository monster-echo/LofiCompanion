import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ApiError } from '../src/lib/apiError';
import {
  mockAdapter,
  paymentProviderForPlatform,
  storeKeyForPlatform,
} from '../src/features/store/data/payment-adapters';
import {
  newSkinOrderIdempotencyKey,
  resolveStoreProductId,
} from '../src/features/store/data/order-service';
import type { SkinProductView } from '../src/features/store/data/product-repository';

// 皮肤商店支付路由与 SKU 解析的纯逻辑测试（node 环境，无 DB）。
// 订单生命周期/权益发放的事务纪律由 Prisma UNIQUE 约束 + $transaction 兜底。

describe('storeKeyForPlatform', () => {
  it('平台 → 商店键：ios→apple / android→google / harmonyos→hms / web→无', () => {
    assert.equal(storeKeyForPlatform('ios'), 'apple');
    assert.equal(storeKeyForPlatform('android'), 'google');
    assert.equal(storeKeyForPlatform('harmonyos'), 'hms');
    assert.equal(storeKeyForPlatform('web'), undefined);
  });
});

describe('paymentProviderForPlatform', () => {
  it("'store' 启用标识按客户端平台分流适配器", () => {
    assert.equal(paymentProviderForPlatform('store', 'ios', 'development').id, 'apple');
    assert.equal(paymentProviderForPlatform('store', 'android', 'development').id, 'google');
    assert.equal(paymentProviderForPlatform('store', 'harmonyos', 'development').id, 'hms');
  });

  it('mock 仅开发环境可用（生产 MOCK_PAYMENT_FORBIDDEN）', () => {
    assert.equal(paymentProviderForPlatform('mock', 'ios', 'development').id, 'mock');
    assert.throws(
      () => paymentProviderForPlatform('mock', 'ios', 'production'),
      (error: unknown) => error instanceof ApiError && error.code === 'MOCK_PAYMENT_FORBIDDEN',
    );
  });

  it('web 平台无商店内购（PAYMENT_PROVIDER_UNSUPPORTED）', () => {
    assert.throws(
      () => paymentProviderForPlatform('store', 'web', 'development'),
      (error: unknown) => error instanceof ApiError && error.code === 'PAYMENT_PROVIDER_UNSUPPORTED',
    );
  });
});

describe('mockAdapter.verifyReceipt', () => {
  it('正常票据回显 productId；fail 票据拒绝', async () => {
    const ok = await mockAdapter.verifyReceipt({
      appId: 'loficompanion', userId: 'u1', receipt: { productId: 'p1' },
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.productId, 'p1');
    const bad = await mockAdapter.verifyReceipt({
      appId: 'loficompanion', userId: 'u1', receipt: { fail: true },
    });
    assert.equal(bad.ok, false);
  });
});

describe('resolveStoreProductId', () => {
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
    ...overrides,
  });

  it('native provider 取本平台 SKU 映射', () => {
    assert.equal(
      resolveStoreProductId(product(), 'ios'),
      'tech.zhongbei.loficompanion.theme.midnight',
    );
  });

  it('缺本平台 SKU 抛 PRODUCT_NOT_MAPPED（下单时的预期门禁）', () => {
    assert.throws(
      () => resolveStoreProductId(product({ storeProductIds: {} }), 'ios'),
      (error: unknown) => error instanceof ApiError && error.code === 'PRODUCT_NOT_MAPPED',
    );
  });

  it('mock 回退商品 id（票据只回显，验证不看映射）', () => {
    const mockProduct = product({ provider: 'mock', storeProductIds: {} });
    assert.equal(resolveStoreProductId(mockProduct, 'ios'), product().id);
  });
});

describe('newSkinOrderIdempotencyKey', () => {
  it('带前缀且不重复', () => {
    const a = newSkinOrderIdempotencyKey();
    const b = newSkinOrderIdempotencyKey();
    assert.match(a, /^skin-order-/);
    assert.notEqual(a, b);
  });
});
