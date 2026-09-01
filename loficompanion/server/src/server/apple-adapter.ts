import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  SignedDataVerifier,
  AppStoreServerAPIClient,
  Environment,
} from '@apple/app-store-server-library';
import type {
  JWSTransactionDecodedPayload,
  ResponseBodyV2DecodedPayload,
  TransactionInfoResponse,
} from '@apple/app-store-server-library';
import { ApiError } from './http';
import { findOrderByStoreTransactionId } from './order-repository';
import type {
  PaymentAdapter,
  PaymentProviderId,
  VerifyResult,
  WebhookEvent,
} from './payment-providers';

const CERTS_DIR = join(process.cwd(), 'certs');

function loadAppleRootCerts(): Buffer[] {
  try {
    return readdirSync(CERTS_DIR)
      .filter((f) => f.endsWith('.cer') || f.endsWith('.pem') || f.endsWith('.crt'))
      .map((f) => readFileSync(join(CERTS_DIR, f)));
  } catch {
    return [];
  }
}

function resolveEnvironment(value: string | undefined): Environment {
  if (value === 'Production') return Environment.PRODUCTION;
  if (value === 'LocalTesting') return Environment.LOCAL_TESTING;
  if (value === 'Xcode') return Environment.XCODE;
  return Environment.SANDBOX;
}

export class AppleAdapter implements PaymentAdapter {
  readonly id: PaymentProviderId = 'apple';
  private verifier: SignedDataVerifier | null = null;
  private apiClient: AppStoreServerAPIClient | null = null;

  private init(): SignedDataVerifier {
    if (this.verifier) return this.verifier;
    const bundleId = process.env.APPLE_BUNDLE_ID;
    const appAppleId = process.env.APPLE_APP_APPLE_ID;
    if (!bundleId || !appAppleId) {
      throw new ApiError(503, 'PAYMENT_PROVIDER_NOT_CONFIGURED', 'Apple 支付尚未配置', true);
    }
    const environment = resolveEnvironment(process.env.APPLE_ENVIRONMENT ?? 'Sandbox');
    this.verifier = new SignedDataVerifier(
      loadAppleRootCerts(),
      false,
      environment,
      bundleId,
      Number(appAppleId),
    );
    return this.verifier;
  }

  /**
   * Build an App Store Server API client for authoritative server-side verification.
   * Uses the issuer key (downloaded from App Store Connect) to call Apple's API directly.
   * This is the Apple-recommended pattern: the client sends a transactionId, the server
   * fetches the JWS from Apple and verifies it — never trusting client-sent data.
   */
  private initApiClient(): AppStoreServerAPIClient {
    if (this.apiClient) return this.apiClient;
    const issuerId = process.env.APPLE_ISSUER_ID;
    const keyId = process.env.APPLE_KEY_ID;
    const bundleId = process.env.APPLE_BUNDLE_ID;
    const keyFile = process.env.APPLE_PRIVATE_KEY_FILE;
    if (!issuerId || !keyId || !bundleId || !keyFile) {
      throw new ApiError(503, 'PAYMENT_PROVIDER_NOT_CONFIGURED', 'Apple Server API 尚未配置', true);
    }
    const keyPath = join(process.cwd(), keyFile);
    if (!existsSync(keyPath)) {
      throw new ApiError(503, 'PAYMENT_PROVIDER_NOT_CONFIGURED', `Apple 私钥文件不存在: ${keyFile}`, true);
    }
    const signingKey = readFileSync(keyPath, 'utf8').trim();
    const environment = resolveEnvironment(process.env.APPLE_ENVIRONMENT ?? 'Sandbox');
    this.apiClient = new AppStoreServerAPIClient(signingKey, keyId, issuerId, bundleId, environment);
    return this.apiClient;
  }

  async verifyReceipt(input: Readonly<{
    appId: string; userId: string; orderId?: string; receipt: unknown;
  }>): Promise<VerifyResult> {
    if (typeof input.receipt !== 'string') return { ok: false };
    try {
      let jws: string;
      if (input.receipt.startsWith('eyJ')) {
        // Client sent a JWS directly (StoreKit 2 signed transaction, or test fixture).
        // Verify it with Apple's root CA — no network call needed.
        jws = input.receipt;
      } else {
        // Client sent a transactionId — Apple's recommended authoritative flow.
        // Fetch the JWS from Apple's App Store Server API, then verify.
        const response: TransactionInfoResponse =
          await this.initApiClient().getTransactionInfo(input.receipt);
        jws = response.signedTransactionInfo ?? '';
        if (!jws) return { ok: false };
      }
      const tx: JWSTransactionDecodedPayload =
        await this.init().verifyAndDecodeTransaction(jws);
      const expiresMs = tx.expiresDate;
      return {
        ok: true,
        storeTransactionId: tx.originalTransactionId ?? '',
        productId: tx.productId ?? '',
        expiresAt: expiresMs ? new Date(Number(expiresMs)).toISOString() : undefined,
      };
    } catch {
      return { ok: false };
    }
  }

  async parseWebhook(
    rawBody: Buffer,
    _headers: Readonly<Record<string, string>>,
  ): Promise<WebhookEvent | null> {
    let signedPayload: string;
    try {
      const body = JSON.parse(rawBody.toString()) as { signedPayload?: string };
      signedPayload = body.signedPayload ?? '';
    } catch {
      throw new ApiError(401, 'WEBHOOK_SIGNATURE_INVALID', 'apple webhook 无 signedPayload', false);
    }
    if (!signedPayload) {
      throw new ApiError(401, 'WEBHOOK_SIGNATURE_INVALID', 'apple webhook 无 signedPayload', false);
    }
    let notif: ResponseBodyV2DecodedPayload;
    try {
      notif = await this.init().verifyAndDecodeNotification(signedPayload);
    } catch {
      throw new ApiError(401, 'WEBHOOK_SIGNATURE_INVALID', 'apple webhook 验签失败', false);
    }
    const notificationType = String(notif.notificationType ?? '');
    // REFUND/REVOKE → 立即撤销；DID_RENEW → 续订；EXPIRED/GRACE_PERIOD_EXPIRED → 到期失效；
    // 其余（SUBSCRIBED/DID_CHANGE_RENEWAL_STATUS/TEST…）不改变权益，忽略。
    let kind: 'renew' | 'refund' | 'expire' = 'renew';
    if (notificationType === 'REFUND' || notificationType === 'REVOKE') kind = 'refund';
    else if (notificationType === 'DID_RENEW') kind = 'renew';
    else if (notificationType === 'EXPIRED' || notificationType === 'GRACE_PERIOD_EXPIRED') kind = 'expire';
    else return null;
    // The Data interface has no originalTransactionId; fall back to decoding signedTransactionInfo.
    let originalTransactionId = '';
    let expiresAt: string | undefined;
    if (notif.data?.signedTransactionInfo) {
      try {
        const tx = await this.init().verifyAndDecodeTransaction(notif.data.signedTransactionInfo);
        originalTransactionId = tx.originalTransactionId ?? '';
        // JWS transaction 的 expiresDate 为毫秒 epoch（数字）
        const rawExpiry = (tx as { expiresDate?: number | string }).expiresDate;
        if (rawExpiry) expiresAt = new Date(Number(rawExpiry)).toISOString();
      } catch {
        // leave empty — webhook-service handles unknown order safely
      }
    }
    let orderId = '';
    if (originalTransactionId) {
      const order = await findOrderByStoreTransactionId(originalTransactionId);
      orderId = order?.id ?? '';
    }
    return { provider: 'apple', eventId: notif.notificationUUID ?? '', kind, orderId, expiresAt };
  }
}

export const appleAdapter = new AppleAdapter();
