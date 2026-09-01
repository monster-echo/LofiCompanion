import { randomUUID } from 'node:crypto';
import type { ClientPlatform } from './client-context';
import { ApiError } from './http';
import { appleAdapter } from './apple-adapter';
import { googleAdapter } from './google-adapter';
import { hmsAdapter } from './hms-adapter';

export type StoreKey = 'apple' | 'google' | 'hms';
export type PaymentProviderId = 'mock' | 'apple' | 'google' | 'hms' | 'wechat' | 'alipay';

export function storeKeyForPlatform(platform: ClientPlatform): StoreKey | undefined {
  if (platform === 'ios') return 'apple';
  if (platform === 'android') return 'google';
  if (platform === 'harmonyos') return 'hms';
  return undefined;
}

export type VerifyResult = Readonly<{
  ok: boolean;
  storeTransactionId?: string;
  productId?: string;
  expiresAt?: string;
  refund?: boolean;
}>;

export type WebhookEvent = Readonly<{
  provider: PaymentProviderId;
  eventId: string;
  kind: 'renew' | 'refund' | 'expire';
  orderId: string;
  /** renew 时的新到期时刻（ISO）；缺失时续订退化为仅延长订单行 */
  expiresAt?: string;
}>;

export interface PaymentAdapter {
  readonly id: PaymentProviderId;
  verifyReceipt(input: Readonly<{
    appId: string; userId: string; orderId?: string; receipt: unknown;
  }>): Promise<VerifyResult>;
  parseWebhook(rawBody: Buffer, headers: Readonly<Record<string, string>>): Promise<WebhookEvent | null>;
}

const mockAdapter: PaymentAdapter = {
  id: 'mock',
  async verifyReceipt({ receipt }) {
    const r = (receipt ?? {}) as { productId?: string; fail?: boolean };
    if (r.fail) return { ok: false };
    return { ok: true, storeTransactionId: `mock-${randomUUID()}`, productId: r.productId };
  },
  async parseWebhook(rawBody) {
    const e = JSON.parse(rawBody.toString()) as Partial<WebhookEvent> & { eventId?: string };
    if (!e.eventId || !e.kind || !e.orderId) return null;
    return {
      provider: 'mock',
      eventId: e.eventId,
      kind: e.kind,
      orderId: e.orderId,
      expiresAt: e.expiresAt,
    };
  },
};

function unavailable(id: PaymentProviderId): PaymentAdapter {
  return {
    id,
    async verifyReceipt() {
      throw new ApiError(503, 'PAYMENT_PROVIDER_NOT_CONFIGURED', `${id} 支付尚未配置`, true);
    },
    async parseWebhook() {
      throw new ApiError(401, 'WEBHOOK_SIGNATURE_INVALID', `${id} webhook 验签失败或未配置`, false);
    },
  };
}

const adapters = new Map<PaymentProviderId, PaymentAdapter>([
  ['mock', mockAdapter],
  ['apple', appleAdapter],
  ['google', googleAdapter],
  ['hms', hmsAdapter],
  ['wechat', unavailable('wechat')],
  ['alipay', unavailable('alipay')],
]);

export function paymentProvider(id: PaymentProviderId, environment: string): PaymentAdapter {
  if (id === 'mock' && environment === 'production') {
    throw new ApiError(503, 'MOCK_PAYMENT_FORBIDDEN', '生产环境禁止使用模拟支付', true);
  }
  const adapter = adapters.get(id);
  if (!adapter) throw new ApiError(400, 'PAYMENT_PROVIDER_UNSUPPORTED', '不支持的支付渠道');
  return adapter;
}
