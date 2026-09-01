/**
 * RN IAP provider — server-authoritative。
 *
 * iOS：回传 transactionId（JWS 标识）→ 服务端走 App Store Server API
 * getTransactionInfo 验签；Android：回传 {productId, purchaseToken} →
 * 服务端走 Play Developer API。finishTransaction 在服务端 verify 成功后
 * 由调用方触发（未完成交易经 purchaseUpdatedListener 自愈）。
 *
 * react-native-iap v16（Nitro Modules）需要 dev client/prebuild 运行时；
 * 懒加载 require——包缺失时 IapPaymentProvider 退化为显式不可用。
 */
import { Platform } from 'react-native';

import type { PurchaseResult, StoreProduct, StoreProductMapping } from './paymentModels';
import type { PaymentProvider } from './paymentProvider';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let RNIap: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  RNIap = require('react-native-iap');
} catch {
  RNIap = null;
}

/** i18next 未初始化/测试环境的兜底文案？否——错误只带码，文案由调用方映射。 */
export type IapFailureKind = 'cancelled' | 'unavailable' | 'network' | 'unknown';

export class IapError extends Error {
  constructor(readonly kind: IapFailureKind, message: string) {
    super(message);
  }
}

interface PendingPurchase {
  resolve: (result: PurchaseResult) => void;
  reject: (error: IapError) => void;
  timer: ReturnType<typeof setTimeout>;
}

const PURCHASE_TIMEOUT_MS = 120_000;

export class IapPaymentProvider implements PaymentProvider {
  /** 店铺端点：iOS=Apple App Store，Android=Google Play */
  private readonly store: 'apple' | 'google';

  /** 单飞初始化 + 全局一次的监听器注册（pending 表按 productId 配对） */
  private static initPromise: Promise<void> | null = null;
  private static pending = new Map<string, PendingPurchase>();
  /** 漏配对的 updated 事件（进程重启后未 finish 的交易）：留待恢复流程 */
  private static unhandled: any[] = [];

  constructor(store: 'apple' | 'google') {
    this.store = store;
  }

  private static async ensureInit(): Promise<void> {
    if (!RNIap) throw new IapError('unavailable', 'react-native-iap not installed');
    if (IapPaymentProvider.initPromise) return IapPaymentProvider.initPromise;
    IapPaymentProvider.initPromise = (async () => {
      await RNIap.initConnection();
      RNIap.purchaseUpdatedListener((purchase: any) => {
        const productId = purchase?.productId ?? '';
        const pending = IapPaymentProvider.pending.get(productId);
        if (pending) {
          clearTimeout(pending.timer);
          IapPaymentProvider.pending.delete(productId);
          pending.resolve(IapPaymentProvider.toResult(purchase));
          return;
        }
        // 无配对请求：多为历史未 finish 交易——留存供 restore/恢复流程
        IapPaymentProvider.unhandled.push(purchase);
      });
      RNIap.purchaseErrorListener((error: any) => {
        const kind: IapFailureKind = /cancel/i.test(String(error?.code ?? error?.message ?? ''))
          ? 'cancelled'
          : /network/i.test(String(error?.code ?? error?.message ?? ''))
            ? 'network'
            : 'unknown';
        for (const [, pending] of IapPaymentProvider.pending) {
          clearTimeout(pending.timer);
          pending.reject(new IapError(kind, String(error?.message ?? 'purchase failed')));
        }
        IapPaymentProvider.pending.clear();
      });
    })();
    return IapPaymentProvider.initPromise;
  }

  /** 平台差异归一：iOS 取 transactionId，Android 取 purchaseToken。 */
  private static toResult(purchase: any): PurchaseResult {
    const productId = String(purchase?.productId ?? '');
    if (Platform.OS === 'ios') {
      const receipt = String(purchase.transactionId ?? purchase.transactionReceipt ?? '');
      return { storeProductId: productId, receipt };
    }
    return {
      storeProductId: productId,
      receipt: { productId, purchaseToken: String(purchase.purchaseToken ?? '') },
    };
  }

  async loadProducts(mapping: StoreProductMapping | null): Promise<readonly StoreProduct[]> {
    if (!mapping || !RNIap) return [];
    await IapPaymentProvider.ensureInit();
    const target = this.store === 'apple' ? mapping.apple : mapping.google;
    if (!target) return [];
    const products = await RNIap.getProducts({ skus: [target] });
    return (products as readonly { id?: string; productId?: string; title?: string; displayPrice?: string; localizedPrice?: string }[])
      .map((p) => ({
        storeProductId: String(p.id ?? p.productId ?? ''),
        title: p.title,
        localizedPrice: p.displayPrice ?? p.localizedPrice,
      }))
      .filter((p) => p.storeProductId !== '');
  }

  async purchase(storeProductId: string): Promise<PurchaseResult> {
    await IapPaymentProvider.ensureInit();
    const existing = IapPaymentProvider.pending.get(storeProductId);
    if (existing) {
      clearTimeout(existing.timer);
      IapPaymentProvider.pending.delete(storeProductId);
    }
    const result = new Promise<PurchaseResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        IapPaymentProvider.pending.delete(storeProductId);
        reject(new IapError('unknown', 'purchase timed out'));
      }, PURCHASE_TIMEOUT_MS);
      IapPaymentProvider.pending.set(storeProductId, { resolve, reject, timer });
    });
    try {
      // iOS 形态 { sku }；Android（Nitro 版）形态 { request: { skus: [...] } }
      if (Platform.OS === 'ios') {
        await RNIap.requestPurchase({ sku: storeProductId });
      } else {
        await RNIap.requestPurchase({ request: { skus: [storeProductId] } });
      }
    } catch (error) {
      IapPaymentProvider.pending.delete(storeProductId);
      throw new IapError('unavailable', String((error as Error)?.message ?? error));
    }
    return result;
  }

  /** 服务端 verify 成功后调用：iOS finishTransaction；Android acknowledge。 */
  async finish(result: PurchaseResult): Promise<void> {
    if (!RNIap) return;
    try {
      const purchase = IapPaymentProvider.unhandled.find(
        (p) => String(p?.productId ?? '') === result.storeProductId,
      );
      if (Platform.OS === 'ios') {
        await RNIap.finishTransaction({
          purchase: purchase ?? { productId: result.storeProductId },
          isConsumable: false,
        });
      } else if (purchase) {
        await RNIap.finishTransaction({ purchase, isConsumable: false });
      }
      if (purchase) {
        IapPaymentProvider.unhandled = IapPaymentProvider.unhandled.filter((p) => p !== purchase);
      }
    } catch {
      // finish 失败不影响权益（服务端已入账）；交易留在队列中自愈
    }
  }

  async restore(): Promise<readonly PurchaseResult[]> {
    if (!RNIap) return [];
    await IapPaymentProvider.ensureInit();
    const purchases = await RNIap.getAvailablePurchases();
    return (purchases as readonly any[]).map((p) => IapPaymentProvider.toResult(p));
  }
}
