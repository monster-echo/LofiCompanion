import type { MembershipTier } from '@/domain/config';
import { ApiError } from '@/server/http';
import { createId, } from '@/server/ids';
import { createHash } from 'node:crypto';
import { database, nowIso, runTransaction } from '@/server/database';
import {
  completeOrder, failOrder, findOrder, findOrderById, insertPendingOrder,
  markProcessing, type OrderStatus, type OrderView,
} from '@/server/order-repository';
import { issueEntitlements } from '@/server/entitlement-service';
import { paymentProvider } from '@/server/payment-providers';
import { findSkinProductBySkinId, type SkinProductView } from './product-repository';

// 皮肤订单全链路（docs/05 §5，P1-A Task 2）：幂等下单 → mock 验证 →
// 订单成功与皮肤权益同一事务发放 → webhook 退款撤销（模板
// revokeEntitlementsForOrder 按 user_entitlements.source_order_id 自动覆盖）
// → 恢复购买（模板 restore 端点按 active entitlements 返回键，皮肤键自然包含）。
// 订单 ↔ 皮肤/权益键的绑定存 skin_orders side table；mock 供应商在开发环境
// 验证票据，真实商店接入后仅替换 adapter（store_product_ids 仍留空）。

export interface SkinOrderMapping {
  orderId: string;
  skinId: string;
  entitlementKey: string;
}

export async function findSkinOrderByOrderId(orderId: string): Promise<SkinOrderMapping | undefined> {
  const row = await database.prepare(
    `SELECT order_id AS orderId, skin_id AS skinId, entitlement_key AS entitlementKey
     FROM skin_orders WHERE order_id = ?`,
  ).get(orderId) as SkinOrderMapping | undefined;
  return row;
}

async function findSkinIdOrSlug(skinIdOrSlug: string): Promise<{ id: string; slug: string } | undefined> {
  return await database.prepare(
    // P3c：skins 目录在 biz；商品行反范式化字段足够解析 id/slug
    `SELECT skin_id AS id, slug FROM skin_products WHERE skin_id = ? OR slug = ?`,
  ).get(skinIdOrSlug, skinIdOrSlug) as { id: string; slug: string } | undefined;
}

export interface SkinOrderView {
  orderId: string;
  skinId: string;
  slug: string;
  entitlementKey: string;
  priceMinor: number;
  currency: string;
  status: OrderStatus;
  provider: string;
  createdAt: string;
  completedAt: string | null;
  entitled: boolean;
}

async function hasActiveEntitlement(userId: string, entitlementKey: string): Promise<boolean> {
  const row = await database.prepare(
    `SELECT 1 FROM user_entitlements
     WHERE user_id = ? AND entitlement_key = ? AND active = 1`,
  ).get(userId, entitlementKey);
  return Boolean(row);
}

function toSkinOrderView(
  order: OrderView, product: SkinProductView, slug: string, entitled: boolean,
): SkinOrderView {
  return {
    orderId: order.id,
    skinId: product.skinId,
    slug,
    entitlementKey: product.entitlementKey,
    priceMinor: product.priceMinor,
    currency: product.currency,
    status: order.status,
    provider: order.provider,
    createdAt: order.createdAt,
    completedAt: order.completedAt,
    entitled,
  };
}

export type CreateSkinOrderInput = Readonly<{
  userId: string;
  skinId: string;
  idempotencyKey: string;
}>;

// 幂等下单：同 (user, idempotencyKey) 返回同一订单；免费皮肤/无商品/下架均拒绝。
export async function createSkinOrder(
  input: CreateSkinOrderInput,
): Promise<SkinOrderView> {
  const skin = await findSkinIdOrSlug(input.skinId);
  if (!skin) throw new ApiError(404, 'SKIN_NOT_FOUND', '皮肤不存在');
  const product = await findSkinProductBySkinId(skin.id);
  if (!product) throw new ApiError(404, 'SKIN_PRODUCT_NOT_FOUND', '该皮肤暂无在售商品');
  if (product.status !== 'active') {
    throw new ApiError(422, 'SKIN_PRODUCT_INACTIVE', '该皮肤商品已下架');
  }

  const existing = await findOrder(input.userId, input.idempotencyKey);
  let order: OrderView;
  if (existing) {
    order = existing;
  } else {
    order = await insertPendingOrder({
      userId: input.userId, planId: product.id, tierId: 'free',
      idempotencyKey: input.idempotencyKey, amountMinor: product.priceMinor,
      currency: product.currency, provider: 'mock',
    });
    await database.prepare(
      `INSERT INTO skin_orders(order_id, skin_id, entitlement_key, created_at)
       VALUES (?, ?, ?, ?) ON CONFLICT (order_id) DO NOTHING`,
    ).run(order.id, product.skinId, product.entitlementKey, nowIso());
  }
  const entitled = await hasActiveEntitlement(input.userId, product.entitlementKey);
  return toSkinOrderView(order, product, skin.slug, entitled);
}

export type VerifySkinOrderInput = Readonly<{
  appId: string;
  environment: string;
  userId: string;
  orderId: string;
  receipt: unknown;
}>;

// 验证并完成皮肤订单：模板 verifyPurchase 检测到 skin_orders 绑定时委托至此，
// 与 /purchases/verify 共用同一路径。成功/退款订单直接返回（重放不重复发权益）；
// 完成订单与发放权益在同一事务提交；皮肤权益永久（expiresAt=null）。
export async function verifySkinOrder(input: VerifySkinOrderInput): Promise<OrderView> {
  const order = await findOrderById(input.orderId);
  if (!order || order.userId !== input.userId) {
    throw new ApiError(404, 'ORDER_NOT_FOUND', '订单不存在');
  }
  const mapping = await findSkinOrderByOrderId(order.id);
  if (!mapping) throw new ApiError(404, 'ORDER_NOT_FOUND', '订单不存在');
  if (order.status === 'success' || order.status === 'refunded') return order;

  const product = await findSkinProductBySkinId(mapping.skinId);
  if (!product) throw new ApiError(404, 'SKIN_PRODUCT_NOT_FOUND', '皮肤商品不存在');

  await markProcessing(order.id);
  const receiptHash = createHash('sha256').update(JSON.stringify(input.receipt)).digest('hex');
  const provider = paymentProvider('mock', input.environment);
  const result = await provider.verifyReceipt({
    appId: input.appId, userId: input.userId, orderId: order.id, receipt: input.receipt,
  });

  return await runTransaction(async () => {
    if (!result.ok) {
      await failOrder(order.id);
      return (await findOrderById(order.id)) as OrderView;
    }
    const done = await completeOrder(order.id, {
      storeTransactionId: result.storeTransactionId ?? '',
      receiptHash,
      expiresAt: null,
    });
    const tier = {
      id: 'skin', name: 'Skin', summary: '', recommended: false, accent: '#000000',
      entitlements: [mapping.entitlementKey],
    } satisfies MembershipTier;
    await issueEntitlements({
      userId: input.userId, appId: input.appId, orderId: order.id, tier, expiresAt: null,
    });
    return done;
  });
}

export type GetSkinOrderInput = Readonly<{
  userId: string;
  orderId: string;
}>;

// 查单（支付中断恢复轮询）：订单状态 + 权益是否已生效。跨用户一律 404。
export async function getSkinOrder(input: GetSkinOrderInput): Promise<SkinOrderView> {
  const order = await findOrderById(input.orderId);
  if (!order || order.userId !== input.userId) {
    throw new ApiError(404, 'ORDER_NOT_FOUND', '订单不存在');
  }
  const mapping = await findSkinOrderByOrderId(order.id);
  if (!mapping) throw new ApiError(404, 'ORDER_NOT_FOUND', '订单不存在');
  const product = await findSkinProductBySkinId(mapping.skinId);
  if (!product) throw new ApiError(404, 'SKIN_PRODUCT_NOT_FOUND', '皮肤商品不存在');
  const skin = await findSkinIdOrSlug(mapping.skinId);
  const entitled = await hasActiveEntitlement(input.userId, mapping.entitlementKey);
  return toSkinOrderView(order, product, skin?.slug ?? '', entitled);
}

// 下单幂等键：客户端未携带时服务端生成（仍保证同键同单）。
export function newSkinOrderIdempotencyKey(): string {
  return `skin-order-${createId()}`;
}
