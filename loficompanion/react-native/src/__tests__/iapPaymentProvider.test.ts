import { describe, it, expect, vi } from 'vitest';

// 平台可切换的 react-native mock（vitest 要求 mock 工厂引用 mock 前缀变量）
const mockPlatform = { os: 'ios' };
vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return mockPlatform.os;
    },
  },
}));

import { IapPaymentProvider } from '../payment/iapPaymentProvider';

// toResult 是 private static：测试经括号访问（纯函数，无 IAP 连接依赖）
const toResult = (purchase: unknown) =>
  (IapPaymentProvider as unknown as { toResult(p: unknown): unknown }).toResult(purchase);

const JWS = 'eyJhbGciOiJFUzI1NiIsImtleXM6IiwiYWxnIjoiRVMyNTYifQ.sig.payload';

describe('iapPaymentProvider.toResult 平台归一', () => {
  it('iOS：JWS 存在时优先于 transactionId（服务端本地验签零网络依赖）', () => {
    mockPlatform.os = 'ios';
    const r = toResult({ productId: 'p1', transactionReceipt: JWS, transactionId: '123' });
    expect(r).toEqual({ storeProductId: 'p1', receipt: JWS });
  });

  it('iOS：无 JWS 时回落 transactionId（走 Server API 回查）', () => {
    mockPlatform.os = 'ios';
    const r = toResult({ productId: 'p1', transactionReceipt: '', transactionId: '123' });
    expect(r).toEqual({ storeProductId: 'p1', receipt: '123' });
  });

  it('iOS：transactionReceipt 非 JWS 形态时回落 transactionId', () => {
    mockPlatform.os = 'ios';
    const r = toResult({ productId: 'p1', transactionReceipt: 'legacy-blob', transactionId: '123' });
    expect(r).toEqual({ storeProductId: 'p1', receipt: '123' });
  });

  it('iOS：两者皆缺时 receipt 为空串（调用方按验证失败处理）', () => {
    mockPlatform.os = 'ios';
    const r = toResult({ productId: 'p1' });
    expect(r).toEqual({ storeProductId: 'p1', receipt: '' });
  });

  it('Android：归一为 {productId, purchaseToken} 对象票据', () => {
    mockPlatform.os = 'android';
    const r = toResult({ productId: 'p1', purchaseToken: 'tok.abc' });
    expect(r).toEqual({
      storeProductId: 'p1',
      receipt: { productId: 'p1', purchaseToken: 'tok.abc' },
    });
  });
});
