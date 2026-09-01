import { createHash } from 'node:crypto';
import type { RuntimeConfig } from '@/domain/config';
import type { ClientPlatform } from './client-context';
import { ApiError } from './http';
import { issueEntitlements } from './entitlement-service';
import { database, runTransaction } from './database';
import {
  completeOrder, failOrder, findOrder, findOrderById, findOrderByReceiptHash,
  insertPendingOrder, listOrders, markProcessing, upsertSubscription, type OrderView,
} from './order-repository';
import { paymentProvider, storeKeyForPlatform } from './payment-providers';
import { findSkinOrderByOrderId, verifySkinOrder } from '@/features/skins/data/order-service';

type Plan = RuntimeConfig['plans'][number];

function planExpiry(plan: Plan): string | null {
  if (plan.interval === 'lifetime' || plan.interval === 'one_time') return null;
  const days = plan.interval === 'month' ? 30 : 365;
  return new Date(Date.now() + days * 86400_000).toISOString();
}

function resolvePlan(config: RuntimeConfig, planId: string): Plan {
  const plan = config.plans.find((p) => p.id === planId);
  if (!plan) throw new ApiError(404, 'PLAN_NOT_FOUND', '订阅方案不存在');
  return plan;
}

function findPlanByProductId(config: RuntimeConfig, productId: string): Plan {
  const plan = config.plans.find((p) =>
    p.storeProductMapping && Object.values(p.storeProductMapping).includes(productId));
  if (!plan) throw new ApiError(404, 'PRODUCT_NOT_MAPPED', '找不到商品对应的方案');
  return plan;
}

export async function ordersForUser(userId: string): Promise<readonly OrderView[]> {
  return await listOrders(userId);
}

type CreateOrderInput = Readonly<{
  userId: string;
  idempotencyKey: string;
  planId: string;
  platform: ClientPlatform;
  config: RuntimeConfig;
}>;

export async function createOrder(input: CreateOrderInput): Promise<{
  orderId: string; storeProductId: string; status: 'pending';
  /** 支付通道——客户端据此选择 IAP/Mock provider（additive，旧客户端忽略） */
  provider: string;
}> {
  const plan = resolvePlan(input.config, input.planId);
  const storeKey = storeKeyForPlatform(input.platform);
  if (!storeKey) throw new ApiError(404, 'PRODUCT_NOT_MAPPED', '当前平台不支持商店内购');
  const storeProductId = plan.storeProductMapping?.[storeKey];
  if (!storeProductId) throw new ApiError(404, 'PRODUCT_NOT_MAPPED', `方案未配置 ${storeKey} 商品 ID`);
  const existing = await findOrder(input.userId, input.idempotencyKey);
  if (existing) return { orderId: existing.id, storeProductId, status: 'pending', provider: plan.provider };
  const order = await insertPendingOrder({
    userId: input.userId, planId: plan.id, tierId: plan.tierId,
    idempotencyKey: input.idempotencyKey, amountMinor: plan.priceMinor,
    currency: plan.currency, provider: plan.provider,
  });
  return { orderId: order.id, storeProductId, status: 'pending', provider: plan.provider };
}

type VerifyInput = Readonly<{
  appId: string; environment: string; userId: string; orderId?: string;
  receipt: unknown; platform: ClientPlatform; config: RuntimeConfig;
}>;

export async function verifyPurchase(input: VerifyInput): Promise<OrderView> {
  const receiptHash = createHash('sha256').update(JSON.stringify(input.receipt)).digest('hex');

  let plan: Plan;
  let orderId: string;
  if (input.orderId) {
    // P1-A 皮肤订单（skin_orders side table 绑定）不走 plan/tier/subscription
    // 语义——委托皮肤订单验证：完成订单 + 按商品发 skin 权益，同一事务。
    const skinOrder = await findSkinOrderByOrderId(input.orderId);
    if (skinOrder) {
      return await verifySkinOrder({
        appId: input.appId, environment: input.environment, userId: input.userId,
        orderId: input.orderId, receipt: input.receipt,
      });
    }
    const order = await findOrderById(input.orderId);
    if (!order || order.userId !== input.userId) throw new ApiError(404, 'ORDER_NOT_FOUND', '订单不存在');
    if (order.status === 'success' || order.status === 'refunded') return order;
    const existing = await findOrderByReceiptHash(input.userId, receiptHash);
    if (existing && existing.status === 'success') return existing;
    plan = resolvePlan(input.config, order.planId);
    orderId = order.id;
    await markProcessing(orderId);
  } else {
    const r = (input.receipt ?? {}) as { productId?: string };
    if (!r.productId) throw new ApiError(400, 'PRODUCT_NOT_MAPPED', 'receipt 缺少 productId');
    plan = findPlanByProductId(input.config, r.productId);
    const existing = await findOrderByReceiptHash(input.userId, receiptHash);
    if (existing && existing.status === 'success') return existing;
    if (existing) {
      orderId = existing.id;
    } else {
      const order = await insertPendingOrder({
        userId: input.userId, planId: plan.id, tierId: plan.tierId,
        idempotencyKey: `restore-${receiptHash.slice(0, 24)}`, amountMinor: plan.priceMinor,
        currency: plan.currency, provider: plan.provider,
      });
      orderId = order.id;
    }
    await markProcessing(orderId);
  }

  const provider = paymentProvider(plan.provider, input.environment);
  const result = await provider.verifyReceipt({
    appId: input.appId, userId: input.userId, orderId, receipt: input.receipt,
  });

  return await runTransaction(async () => {
    if (!result.ok) {
      await failOrder(orderId);
      return (await findOrderById(orderId)) as OrderView;
    }
    const expiresAt = result.expiresAt ?? planExpiry(plan);
    const done = await completeOrder(orderId, {
      storeTransactionId: result.storeTransactionId ?? '',
      receiptHash, expiresAt,
    });
    // 同步用户档位（/v1/me/entitlement 的 HMAC Pro token 数据源）
    await database.prepare(`UPDATE users SET tier_id = ? WHERE id = ?`).run(plan.tierId, input.userId);
    const tier = input.config.tiers.find((t) => t.id === plan.tierId);
    if (tier) {
      await issueEntitlements({
        userId: input.userId, appId: input.appId, orderId, tier, expiresAt,
      });
    }
    await upsertSubscription({
      userId: input.userId, appId: input.appId, planId: plan.id, platform: input.platform,
      status: 'active', currentOrderId: orderId, renewAt: expiresAt,
    });
    return done;
  });
}

type RestoreInput = Readonly<{
  appId: string; environment: string; userId: string; receipts: readonly unknown[];
  platform: ClientPlatform; config: RuntimeConfig;
}>;

export async function restorePurchases(input: RestoreInput): Promise<readonly OrderView[]> {
  const results: OrderView[] = [];
  for (const receipt of input.receipts) {
    try {
      results.push(await verifyPurchase({
        appId: input.appId, environment: input.environment, userId: input.userId,
        receipt, platform: input.platform, config: input.config,
      }));
    } catch {
      // single receipt failure does not abort the rest; failed order recorded
    }
  }
  return results;
}
