import type { PurchaseResult, StoreProduct, StoreProductMapping } from './paymentModels';

export interface PaymentProvider {
  loadProducts(mapping: StoreProductMapping | null): Promise<readonly StoreProduct[]>;
  purchase(storeProductId: string): Promise<PurchaseResult>;
  restore(): Promise<readonly PurchaseResult[]>;
  /** 服务端 verify 成功后确认交易（IAP）；mock 无需实现。 */
  finish?(result: PurchaseResult): Promise<void>;
}
