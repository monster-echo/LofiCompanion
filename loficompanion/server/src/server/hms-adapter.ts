import { ApiError } from './http';
import { findOrderByStoreTransactionId } from './order-repository';
import type {
  PaymentAdapter,
  PaymentProviderId,
  VerifyResult,
  WebhookEvent,
} from './payment-providers';

const HMS_TOKEN_URL = 'https://oauth-login.cloud.huawei.com/oauth2/v3/token';

interface CachedToken {
  token: string;
  expiresAt: number;
}

/**
 * HMS (Huawei) IAP server-side verification adapter.
 *
 * The client sends a purchaseToken (string) as the receipt.
 * The server gets an OAuth2 access token (client_id + client_secret),
 * then calls the HMS IAP order verification API to confirm the purchase.
 *
 * Config: HMS_CLIENT_ID, HMS_CLIENT_SECRET, HMS_APP_ID,
 * HMS_IAP_ORDERS_URL (region-specific, e.g. https://orders-dre.iap.hicloud.com).
 *
 * HMS notifications: HMS IAP uses either a configured notification URL
 * (push) or a pull API. parseWebhook parses the push format if configured;
 * otherwise throws 401 (not configured). Real verification needs a device.
 */
export class HMSAdapter implements PaymentAdapter {
  readonly id: PaymentProviderId = 'hms';
  private cachedToken: CachedToken | null = null;

  private checkConfig(): void {
    if (!process.env.HMS_CLIENT_ID || !process.env.HMS_CLIENT_SECRET || !process.env.HMS_APP_ID) {
      throw new ApiError(503, 'PAYMENT_PROVIDER_NOT_CONFIGURED', 'HMS 支付尚未配置', true);
    }
  }

  private async getAccessToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.cachedToken.expiresAt - 60000) {
      return this.cachedToken.token;
    }
    const clientId = process.env.HMS_CLIENT_ID!;
    const clientSecret = process.env.HMS_CLIENT_SECRET!;
    const response = await fetch(HMS_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    if (!response.ok) {
      throw new ApiError(502, 'PAYMENT_PROVIDER_NOT_CONFIGURED', 'HMS OAuth2 token 获取失败', true);
    }
    const data = await response.json() as { access_token?: string; expires_in?: number };
    if (!data.access_token) {
      throw new ApiError(502, 'PAYMENT_PROVIDER_NOT_CONFIGURED', 'HMS OAuth2 无 access_token', true);
    }
    const expiresIn = (data.expires_in ?? 3600) * 1000;
    this.cachedToken = { token: data.access_token, expiresAt: Date.now() + expiresIn };
    return data.access_token;
  }

  async verifyReceipt(input: Readonly<{
    appId: string; userId: string; orderId?: string; receipt: unknown;
  }>): Promise<VerifyResult> {
    if (typeof input.receipt !== 'string') return { ok: false };
    const purchaseToken = input.receipt;
    if (!purchaseToken) return { ok: false };

    this.checkConfig();
    const appId = process.env.HMS_APP_ID!;
    const ordersUrl = process.env.HMS_IAP_ORDERS_URL ?? 'https://orders-dre.iap.hicloud.com';

    try {
      const token = await this.getAccessToken();
      const response = await fetch(
        `${ordersUrl}/applications/${appId}/purchases/tokens/verify`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json; charset=UTF-8',
          },
          body: JSON.stringify({ purchaseToken }),
        },
      );
      if (!response.ok) return { ok: false };

      const result = await response.json() as {
        responseCode?: string;
        purchaseTokenData?: {
          purchaseState?: number;  // 0=Purchased, 1=Canceled, 2=Refunded
          productId?: string;
          responseId?: string;
        };
      };

      // responseCode "0" = success; purchaseState 0 = purchased.
      if (result.responseCode !== '0' && result.responseCode !== '0') {
        return { ok: false };
      }
      const data = result.purchaseTokenData;
      if (!data) return { ok: false };
      if (data.purchaseState !== undefined && data.purchaseState !== 0) {
        return { ok: false };
      }

      return {
        ok: true,
        storeTransactionId: purchaseToken,
        productId: data.productId ?? '',
      };
    } catch {
      return { ok: false };
    }
  }

  async parseWebhook(
    _rawBody: Buffer,
    _headers: Readonly<Record<string, string>>,
  ): Promise<WebhookEvent | null> {
    // HMS IAP push notifications (if configured in AppGallery Connect)
    // arrive as a POST with the notification JSON. Parse the notification,
    // extract notificationType + purchaseToken.
    //
    // HMS notification types: 1=INITIAL_PURCHASE, 2=CANCEL, 3=RENEW,
    // 5=EXPIRE, 8=REFUND, 11=GRACE_PERIOD.
    //
    // For P-4a: skeleton — real verification needs the HMS notification
    // format confirmed from AppGallery Connect + a device test.
    throw new ApiError(401, 'WEBHOOK_SIGNATURE_INVALID', 'HMS webhook 尚未配置', false);
  }
}

export const hmsAdapter = new HMSAdapter();
