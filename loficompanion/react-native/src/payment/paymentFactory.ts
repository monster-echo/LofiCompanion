import { Platform } from 'react-native';

import { IapPaymentProvider } from './iapPaymentProvider';
import type { PaymentProvider } from './paymentProvider';
import { MockPaymentProvider } from './mockPaymentProvider';

/**
 * 支付提供方选择：plan.provider === 'mock' 仅开发环境可用（对齐服务端
 * MOCK_PAYMENT_FORBIDDEN 姿态）；其余一律走原生商店 IAP——店铺端点由
 * 平台决定（iOS=Apple，Android=Google），商品 id 取 plan.storeProductMapping。
 */
export function createPaymentProvider(
  plan: { readonly provider: string },
  platform: string = Platform.OS,
): PaymentProvider {
  if (plan.provider === 'mock') {
    if (__DEV__) return new MockPaymentProvider();
    throw new Error('STORE_PROVIDER_UNAVAILABLE');
  }
  return new IapPaymentProvider(platform === 'ios' ? 'apple' : 'google');
}
