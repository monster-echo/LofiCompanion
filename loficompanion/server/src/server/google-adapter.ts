import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { GoogleAuth } from 'google-auth-library';
import { ApiError } from './http';
import { findOrderByStoreTransactionId } from './order-repository';
import type {
  PaymentAdapter,
  PaymentProviderId,
  VerifyResult,
  WebhookEvent,
} from './payment-providers';

const PLAY_API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

/**
 * Google Play Developer API adapter — server-authoritative verification.
 *
 * The client sends { productId, purchaseToken } as the receipt.
 * The server calls Google Play Developer API to verify the purchase,
 * extracts productId + expiryTimeMillis, and returns the result.
 *
 * RTDN (Real-time Developer Notifications) arrive via Google Pub/Sub push
 * to /webhooks/google; parseWebhook decodes the Pub/Sub envelope + maps
 * notificationType → WebhookEvent.
 */
export class GoogleAdapter implements PaymentAdapter {
  readonly id: PaymentProviderId = 'google';
  private auth: GoogleAuth | null = null;

  private initAuth(): GoogleAuth {
    if (this.auth) return this.auth;
    const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_FILE;
    if (!keyFile) {
      throw new ApiError(503, 'PAYMENT_PROVIDER_NOT_CONFIGURED', 'Google 支付尚未配置', true);
    }
    const keyPath = join(process.cwd(), keyFile);
    if (!existsSync(keyPath)) {
      throw new ApiError(503, 'PAYMENT_PROVIDER_NOT_CONFIGURED', `Google 服务账号文件不存在: ${keyFile}`, true);
    }
    this.auth = new GoogleAuth({ keyFile: keyPath, scopes: [SCOPE] });
    return this.auth;
  }

  private async getAccessToken(): Promise<string> {
    const client = await this.initAuth().getClient();
    const token = await client.getAccessToken();
    return token.token ?? '';
  }

  async verifyReceipt(input: Readonly<{
    appId: string; userId: string; orderId?: string; receipt: unknown;
  }>): Promise<VerifyResult> {
    if (typeof input.receipt !== 'object' || input.receipt === null) {
      return { ok: false };
    }
    const { productId, purchaseToken } = input.receipt as { productId?: string; purchaseToken?: string };
    if (!productId || !purchaseToken) return { ok: false };

    const packageName = process.env.GOOGLE_PACKAGE_NAME;
    if (!packageName) return { ok: false };

    try {
      const token = await this.getAccessToken();
      const headers = { Authorization: `Bearer ${token}` };

      // Try subscription verification first (month/year plans).
      let response = await fetch(
        `${PLAY_API}/${packageName}/purchases/subscriptions/${productId}/tokens/${purchaseToken}`,
        { headers },
      );
      let isSubscription = true;

      // 404 → not a subscription; try one-time product.
      if (response.status === 404) {
        isSubscription = false;
        response = await fetch(
          `${PLAY_API}/${packageName}/purchases/products/${productId}/tokens/${purchaseToken}`,
          { headers },
        );
      }

      if (!response.ok) return { ok: false };
      const purchase = await response.json() as Record<string, unknown>;

      // Subscriptions: expiryTimeMillis + ack state.
      // Products: purchaseState (0=Purchased, 1=Canceled).
      const expiryMs = purchase['expiryTimeMillis'] as string | undefined;
      const purchaseState = purchase['purchaseState'] as number | undefined;
      const consumptionState = purchase['consumptionState'] as number | undefined;

      // For one-time products, purchaseState 0 = Purchased.
      if (purchaseState !== undefined && purchaseState !== 0) {
        return { ok: false };
      }

      // 购买确认：未 ack 的购买 3 天后会被 Google 自动退款。acknowledge 幂等
      // （409/已 ack 视为成功）；ack 失败不否决验签结果，只尽力补 ack。
      const acknowledgementState = purchase['acknowledgementState'] as number | undefined;
      if (acknowledgementState === 0) {
        const kind = isSubscription ? 'subscriptions' : 'products';
        await fetch(
          `${PLAY_API}/${packageName}/purchases/${kind}/${productId}/tokens/${purchaseToken}:acknowledge`,
          { method: 'POST', headers, body: '{}' },
        ).catch(() => undefined);
      }

      return {
        ok: true,
        storeTransactionId: purchaseToken,
        productId,
        expiresAt: expiryMs ? new Date(Number(expiryMs)).toISOString() : undefined,
      };
    } catch {
      return { ok: false };
    }
  }

  async parseWebhook(
    rawBody: Buffer,
    _headers: Readonly<Record<string, string>>,
  ): Promise<WebhookEvent | null> {
    // Google RTDN arrives as a Pub/Sub push: { message: { data, messageId }, subscription }
    // The `data` is base64-encoded JSON: DeveloperNotification.
    let envelope: { message?: { data?: string; messageId?: string } };
    try {
      envelope = JSON.parse(rawBody.toString()) as typeof envelope;
    } catch {
      throw new ApiError(401, 'WEBHOOK_SIGNATURE_INVALID', 'Google RTDN 格式无效', false);
    }
    const data = envelope.message?.data;
    if (!data) {
      throw new ApiError(401, 'WEBHOOK_SIGNATURE_INVALID', 'Google RTDN 无 data', false);
    }

    let notification: Record<string, unknown>;
    try {
      notification = JSON.parse(
        Buffer.from(data, 'base64').toString('utf8'),
      ) as Record<string, unknown>;
    } catch {
      throw new ApiError(401, 'WEBHOOK_SIGNATURE_INVALID', 'Google RTDN data 解码失败', false);
    }

    // DeveloperNotification shape:
    //   { version, packageName, eventTimeMillis,
    //     subscriptionNotification: { notificationType, purchaseToken, subscriptionId },
    //     oneTimeProductNotification: { notificationType, purchaseToken, sku },
    //     voidedPurchaseNotification: { purchaseToken, orderId, productType, refundState } }
    const subNotif = notification['subscriptionNotification'] as Record<string, unknown> | undefined;
    const oneTimeNotif = notification['oneTimeProductNotification'] as Record<string, unknown> | undefined;
    const voidedNotif = notification['voidedPurchaseNotification'] as Record<string, unknown> | undefined;

    // Map notification types to refund/renew.
    // RTDN subscriptionNotification types: 1=RECOVERED, 2=RENEWED, 3=CANCELED, 4=PURCHASED,
    //   5=ON_HOLD, 6=IN_GRACE, 7=RESTARTED, 8=REVOKED, 12=EXPIRED, 13=PRICE_CHANGE_CONFIRMED.
    // Voided purchase notification = refund.
    let kind: 'refund' | 'renew' = 'renew';
    let purchaseToken = '';

    if (voidedNotif) {
      kind = 'refund';
      purchaseToken = String(voidedNotif['purchaseToken'] ?? '');
    } else if (subNotif) {
      purchaseToken = String(subNotif['purchaseToken'] ?? '');
      const nt = Number(subNotif['notificationType'] ?? 0);
      // REVOKED(8), EXPIRED(12), CANCELED(3) → revoke/expire entitlement.
      if (nt === 3 || nt === 8 || nt === 12) kind = 'refund';
    } else if (oneTimeNotif) {
      purchaseToken = String(oneTimeNotif['purchaseToken'] ?? '');
    } else {
      return null;
    }

    // Find our order by the purchase token (stored as store_transaction_id).
    let orderId = '';
    if (purchaseToken) {
      const order = await findOrderByStoreTransactionId(purchaseToken);
      orderId = order?.id ?? '';
    }

    return {
      provider: 'google',
      eventId: envelope.message?.messageId ?? '',
      kind,
      orderId,
    };
  }
}

export const googleAdapter = new GoogleAdapter();
