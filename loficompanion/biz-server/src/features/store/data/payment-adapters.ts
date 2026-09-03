import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  SignedDataVerifier,
  AppStoreServerAPIClient,
  Environment,
  type JWSTransactionDecodedPayload,
  type TransactionInfoResponse,
} from '@apple/app-store-server-library';
import { GoogleAuth } from 'google-auth-library';
import { ApiError } from '@/lib/apiError';

// 皮肤商店支付适配器（P4 自基础设施 auth 迁入的 verify-only 裁剪版）。
// 皮肤是非消耗型买断：无订阅续订、无 webhook——验证只在 verify 时发生，
// 服务端权威（Apple Server API 回查 JWS / Play Developer API 回查购买态）。
//
// provider 是业务启用标识（'mock'=模拟支付仅开发；'store'=原生商店 IAP），
// 不是适配器 id——真实适配器在 verify 时按客户端上报平台动态分流：
// ios→apple、android→google、harmonyos→hms。

export type ClientPlatform = 'ios' | 'android' | 'harmonyos' | 'web';

export type StoreKey = 'apple' | 'google' | 'hms';

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
}>;

export type VerifyReceiptInput = Readonly<{
  appId: string;
  userId: string;
  orderId?: string;
  receipt: unknown;
}>;

export interface PaymentAdapter {
  readonly id: string;
  verifyReceipt(input: VerifyReceiptInput): Promise<VerifyResult>;
}

// ── mock（仅开发；生产在 paymentProviderForPlatform 处拒绝）────────────────

export const mockAdapter: PaymentAdapter = {
  id: 'mock',
  async verifyReceipt({ receipt }) {
    const r = (receipt ?? {}) as { productId?: string; fail?: boolean };
    if (r.fail) return { ok: false };
    return { ok: true, storeTransactionId: `mock-${randomUUID()}`, productId: r.productId };
  },
};

// ── apple：StoreKit 2 JWS 本地验签 / transactionId 经 App Store Server API 回查

const APPLE_CERTS_DIR = join(process.cwd(), 'certs');

function loadAppleRootCerts(): Buffer[] {
  try {
    return readdirSync(APPLE_CERTS_DIR)
      .filter((f) => f.endsWith('.cer') || f.endsWith('.pem') || f.endsWith('.crt'))
      .map((f) => readFileSync(join(APPLE_CERTS_DIR, f)));
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
  readonly id = 'apple';
  private verifier: SignedDataVerifier | null = null;
  private apiClient: AppStoreServerAPIClient | null = null;

  private init(): SignedDataVerifier {
    if (this.verifier) return this.verifier;
    const bundleId = process.env.APPLE_BUNDLE_ID;
    const appAppleId = process.env.APPLE_APP_APPLE_ID;
    if (!bundleId || !appAppleId) {
      throw new ApiError(503, 'PAYMENT_PROVIDER_NOT_CONFIGURED', 'Apple 支付尚未配置', true);
    }
    this.verifier = new SignedDataVerifier(
      loadAppleRootCerts(),
      false,
      resolveEnvironment(process.env.APPLE_ENVIRONMENT ?? 'Sandbox'),
      bundleId,
      Number(appAppleId),
    );
    return this.verifier;
  }

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
    this.apiClient = new AppStoreServerAPIClient(
      readFileSync(keyPath, 'utf8').trim(),
      keyId,
      issuerId,
      bundleId,
      resolveEnvironment(process.env.APPLE_ENVIRONMENT ?? 'Sandbox'),
    );
    return this.apiClient;
  }

  async verifyReceipt(input: VerifyReceiptInput): Promise<VerifyResult> {
    if (typeof input.receipt !== 'string') return { ok: false };
    try {
      let jws: string;
      if (input.receipt.startsWith('eyJ')) {
        // 客户端直接给了 JWS（StoreKit 2 签名交易或测试夹具）：本地根 CA 验签，零网络
        jws = input.receipt;
      } else {
        // 客户端给 transactionId——Apple 推荐的权威流：从 App Store Server API
        // 取 JWS 再验签，绝不信任客户端数据
        const response: TransactionInfoResponse =
          await this.initApiClient().getTransactionInfo(input.receipt);
        jws = response.signedTransactionInfo ?? '';
        if (!jws) return { ok: false };
      }
      const tx: JWSTransactionDecodedPayload =
        await this.init().verifyAndDecodeTransaction(jws);
      return {
        ok: true,
        storeTransactionId: tx.originalTransactionId ?? '',
        productId: tx.productId ?? '',
      };
    } catch {
      return { ok: false };
    }
  }
}

// ── google：Play Developer API 回查购买态（订阅先行、404 落一次性商品）──────

const PLAY_API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
const PLAY_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

export class GoogleAdapter implements PaymentAdapter {
  readonly id = 'google';
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
    this.auth = new GoogleAuth({ keyFile: keyPath, scopes: [PLAY_SCOPE] });
    return this.auth;
  }

  private async getAccessToken(): Promise<string> {
    const client = await this.initAuth().getClient();
    const token = await client.getAccessToken();
    return token.token ?? '';
  }

  async verifyReceipt(input: VerifyReceiptInput): Promise<VerifyResult> {
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

      // 订阅先行（月/年计划）；404 → 非订阅，落一次性商品购买
      let response = await fetch(
        `${PLAY_API}/${packageName}/purchases/subscriptions/${productId}/tokens/${purchaseToken}`,
        { headers },
      );
      let isSubscription = true;
      if (response.status === 404) {
        isSubscription = false;
        response = await fetch(
          `${PLAY_API}/${packageName}/purchases/products/${productId}/tokens/${purchaseToken}`,
          { headers },
        );
      }
      if (!response.ok) return { ok: false };
      const purchase = await response.json() as Record<string, unknown>;

      const purchaseState = purchase['purchaseState'] as number | undefined;
      // 一次性商品 purchaseState 0 = Purchased
      if (purchaseState !== undefined && purchaseState !== 0) {
        return { ok: false };
      }

      // 购买确认：未 ack 的购买 3 天后会被 Google 自动退款。acknowledge 幂等；
      // 失败不否决验签结果，只尽力补 ack。
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
      };
    } catch {
      return { ok: false };
    }
  }
}

// ── hms：HMS IAP 订单验证（OAuth2 client credentials + verify API）─────────

const HMS_TOKEN_URL = 'https://oauth-login.cloud.huawei.com/oauth2/v3/token';

interface CachedToken {
  token: string;
  expiresAt: number;
}

export class HMSAdapter implements PaymentAdapter {
  readonly id = 'hms';
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
    const response = await fetch(HMS_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.HMS_CLIENT_ID!,
        client_secret: process.env.HMS_CLIENT_SECRET!,
      }),
    });
    if (!response.ok) {
      throw new ApiError(502, 'PAYMENT_PROVIDER_NOT_CONFIGURED', 'HMS OAuth2 token 获取失败', true);
    }
    const data = await response.json() as { access_token?: string; expires_in?: number };
    if (!data.access_token) {
      throw new ApiError(502, 'PAYMENT_PROVIDER_NOT_CONFIGURED', 'HMS OAuth2 无 access_token', true);
    }
    this.cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    };
    return data.access_token;
  }

  async verifyReceipt(input: VerifyReceiptInput): Promise<VerifyResult> {
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
          purchaseState?: number; // 0=Purchased, 1=Canceled, 2=Refunded
          productId?: string;
        };
      };

      if (result.responseCode !== '0') return { ok: false };
      const data = result.purchaseTokenData;
      if (!data) return { ok: false };
      if (data.purchaseState !== undefined && data.purchaseState !== 0) {
        return { ok: false };
      }
      return { ok: true, storeTransactionId: purchaseToken, productId: data.productId ?? '' };
    } catch {
      return { ok: false };
    }
  }
}

export const appleAdapter = new AppleAdapter();
export const googleAdapter = new GoogleAdapter();
export const hmsAdapter = new HMSAdapter();

function unavailable(id: string): PaymentAdapter {
  return {
    id,
    async verifyReceipt() {
      throw new ApiError(503, 'PAYMENT_PROVIDER_NOT_CONFIGURED', `${id} 支付尚未配置`, true);
    },
  };
}

const adapters = new Map<string, PaymentAdapter>([
  ['mock', mockAdapter],
  ['apple', appleAdapter],
  ['google', googleAdapter],
  ['hms', hmsAdapter],
  ['wechat', unavailable('wechat')],
  ['alipay', unavailable('alipay')],
]);

export function paymentProvider(id: string, environment: string): PaymentAdapter {
  if (id === 'mock' && environment === 'production') {
    throw new ApiError(503, 'MOCK_PAYMENT_FORBIDDEN', '生产环境禁止使用模拟支付', true);
  }
  const adapter = adapters.get(id);
  if (!adapter) throw new ApiError(400, 'PAYMENT_PROVIDER_UNSUPPORTED', '不支持的支付渠道');
  return adapter;
}

// 启用标识集合：'store' 为推荐写法，apple/google/hms 为历史值兼容
const STORE_ENABLED = new Set(['store', 'apple', 'google', 'hms']);

export function paymentProviderForPlatform(
  enabled: string,
  platform: ClientPlatform,
  environment: string,
): PaymentAdapter {
  if (enabled === 'mock') return paymentProvider('mock', environment);
  if (!STORE_ENABLED.has(enabled)) {
    return paymentProvider(enabled, environment);
  }
  const storeKey = storeKeyForPlatform(platform);
  if (!storeKey) {
    throw new ApiError(400, 'PAYMENT_PROVIDER_UNSUPPORTED', '当前客户端平台不支持商店内购');
  }
  return paymentProvider(storeKey, environment);
}
