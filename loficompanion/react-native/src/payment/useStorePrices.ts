import { useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import type { BillingPlan } from '../domain/models';
import { IapPaymentProvider } from './iapPaymentProvider';

/**
 * 商店本地化价格（App Store 审核要求：价格展示必须来自商店）。
 * 按平台映射取 SKU，经 IAP getProducts 拉本地化价格串；商店不可达 /
 * 开发环境（无 dev client 原生模块）时返回空表，调用方回落服务端价格。
 * 键 = storeProductId；辅助 storeSkuOf(plan) 解析当前平台的 SKU。
 */

export function storeSkuOf(plan: BillingPlan): string | null {
  const sku = Platform.OS === 'ios'
    ? plan.storeProductMapping?.apple
    : plan.storeProductMapping?.google;
  return sku ?? null;
}

export function useStorePrices(plans: readonly BillingPlan[]): Readonly<Record<string, string>> {
  const skus = useMemo(
    () => plans.map((plan) => storeSkuOf(plan)).filter((sku): sku is string => sku !== null),
    [plans],
  );
  const [prices, setPrices] = useState<Readonly<Record<string, string>>>({});
  const skusKey = skus.join(',');

  useEffect(() => {
    if (skusKey === '') return;
    let alive = true;
    void (async () => {
      const provider = new IapPaymentProvider(Platform.OS === 'ios' ? 'apple' : 'google');
      const merged: Record<string, string> = {};
      // 逐 SKU 拉取（跨方案通常各自独立商品；失败静默回落服务端价格）
      for (const sku of skusKey.split(',')) {
        try {
          const products = await provider.loadProducts({
            apple: Platform.OS === 'ios' ? sku : undefined,
            google: Platform.OS === 'android' ? sku : undefined,
          });
          for (const product of products) {
            if (product.localizedPrice) merged[product.storeProductId] = product.localizedPrice;
          }
        } catch {
          // 商店不可达/未配置：回落
        }
      }
      if (alive) setPrices(merged);
    })();
    return () => {
      alive = false;
    };
  }, [skusKey]);

  return prices;
}
