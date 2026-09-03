import { createHash, randomUUID } from 'node:crypto';
import { ApiError } from '@/lib/apiError';
import { getDb } from '@/db';
import { findSkinProductBySkinId, type SkinProductView } from './product-repository';
import {
  completeSkinOrder,
  failSkinOrder,
  findSkinOrderById,
  insertSkinOrderIfAbsent,
  markSkinOrderProcessing,
  type SkinOrderRow,
  type SkinOrderStatus,
} from './order-repository';
import { grantSkinEntitlementInTx, hasActiveSkinEntitlement } from './entitlement-service';
import {
  paymentProviderForPlatform,
  storeKeyForPlatform,
} from './payment-adapters';
import type { ClientPlatform } from './payment-adapters';

// 皮肤订单全链路（P4 自基础设施 auth 迁入并自包含）：幂等下单 → 验证 →
// 订单成功与皮肤权益同一事务发放。皮肤为非消耗型买断：权益永久、无续订
// webhook（会员订阅链路仍在 auth）。商品行 provider 是业务启用标识
//（'mock'=模拟支付仅开发；'store'=原生商店 IAP），验证适配器按客户端上报
// 平台动态分流（ios→apple / android→google / harmonyos→hms）。

export interface SkinOrderView {
  orderId: string;
  skinId: string;
  slug: string;
  entitlementKey: string;
  priceMinor: number;
  currency: string;
  status: SkinOrderStatus;
  provider: string;
  /** 本平台商店 SKU（native provider 时为映射值；mock 时为商品 id，票据只回显） */
  storeProductId: string;
  createdAt: string;
  completedAt: string | null;
  entitled: boolean;
}

async function findSkinIdOrSlug(skinIdOrSlug: string): Promise<{ id: string; slug: string } | undefined> {
  const product = await findSkinProductBySkinId(skinIdOrSlug);
  if (product) return { id: product.skinId, slug: product.slug };
  const bySlug = await getDb().skinProduct.findFirst({
    where: { slug: skinIdOrSlug },
    select: { skin_id: true, slug: true },
  });
  return bySlug ? { id: bySlug.skin_id, slug: bySlug.slug } : undefined;
}

// 平台商店 SKU 解析：native provider 必须已配置映射，mock 回退商品 id
//（MockPaymentProvider 票据只回显 productId，验证不看映射）。
export function resolveStoreProductId(product: SkinProductView, platform: ClientPlatform): string {
  if (product.provider === 'mock') return product.id;
  const storeKey = storeKeyForPlatform(platform);
  if (!storeKey) throw new ApiError(404, 'PRODUCT_NOT_MAPPED', '当前平台不支持商店内购');
  const storeProductId = product.storeProductIds[storeKey];
  if (!storeProductId) {
    throw new ApiError(404, 'PRODUCT_NOT_MAPPED', `皮肤商品未配置 ${storeKey} 商品 ID`);
  }
  return storeProductId;
}

function toSkinOrderView(
  order: SkinOrderRow,
  product: SkinProductView,
  slug: string,
  storeProductId: string,
  entitled: boolean,
): SkinOrderView {
  return {
    orderId: order.id,
    skinId: product.skinId,
    slug,
    entitlementKey: product.entitlementKey,
    priceMinor: product.priceMinor,
    currency: product.currency,
    status: order.status as SkinOrderStatus,
    provider: order.provider,
    storeProductId,
    createdAt: order.created_at,
    completedAt: order.completed_at,
    entitled,
  };
}

export type CreateSkinOrderInput = Readonly<{
  userId: string;
  skinId: string;
  idempotencyKey: string;
  platform: ClientPlatform;
}>;

// 幂等下单：同 (user, idempotencyKey) 返回同一订单；免费皮肤/无商品/下架均拒绝。
export async function createSkinOrder(input: CreateSkinOrderInput): Promise<SkinOrderView> {
  const skin = await findSkinIdOrSlug(input.skinId);
  if (!skin) throw new ApiError(404, 'SKIN_NOT_FOUND', '皮肤不存在');
  const product = await findSkinProductBySkinId(skin.id);
  if (!product) throw new ApiError(404, 'SKIN_PRODUCT_NOT_FOUND', '该皮肤暂无在售商品');
  if (product.status !== 'active') {
    throw new ApiError(422, 'SKIN_PRODUCT_INACTIVE', '该皮肤商品已下架');
  }
  const storeProductId = resolveStoreProductId(product, input.platform);

  const order = await insertSkinOrderIfAbsent({
    userId: input.userId,
    skinId: product.skinId,
    entitlementKey: product.entitlementKey,
    idempotencyKey: input.idempotencyKey,
    amountMinor: product.priceMinor,
    currency: product.currency,
    provider: product.provider,
  });
  const entitled = await hasActiveSkinEntitlement(input.userId, product.entitlementKey);
  return toSkinOrderView(order, product, skin.slug, storeProductId, entitled);
}

export type VerifySkinOrderInput = Readonly<{
  appId: string;
  environment: string;
  userId: string;
  orderId: string;
  receipt: unknown;
  /** 客户端上报平台：native 启用时按此分流验证适配器（ios→apple / android→google） */
  platform: ClientPlatform;
}>;

// 验证并完成皮肤订单：成功/退款订单直接返回（重放不重复发权益）；完成订单
// 与发放权益在同一事务提交；皮肤权益永久（expiresAt=null）。
export async function verifySkinOrder(input: VerifySkinOrderInput): Promise<SkinOrderRow> {
  const order = await findSkinOrderById(input.orderId);
  if (!order || order.user_id !== input.userId) {
    throw new ApiError(404, 'ORDER_NOT_FOUND', '订单不存在');
  }
  if (order.status === 'success' || order.status === 'refunded') return order;

  const product = await findSkinProductBySkinId(order.skin_id);
  if (!product) throw new ApiError(404, 'SKIN_PRODUCT_NOT_FOUND', '皮肤商品不存在');

  await markSkinOrderProcessing(order.id);
  const receiptHash = createHash('sha256').update(JSON.stringify(input.receipt)).digest('hex');
  // 启用标识取当前商品行；真实适配器按上报平台分流。'mock' 在生产被拒
  //（MOCK_PAYMENT_FORBIDDEN）。
  const provider = paymentProviderForPlatform(product.provider, input.platform, input.environment);
  const result = await provider.verifyReceipt({
    appId: input.appId,
    userId: input.userId,
    orderId: order.id,
    receipt: input.receipt,
  });

  return await getDb().$transaction(async (tx) => {
    if (!result.ok) {
      return await failSkinOrder(order.id);
    }
    const done = await tx.skinOrder.update({
      where: { id: order.id },
      data: {
        status: 'success',
        store_transaction_id: result.storeTransactionId ?? '',
        receipt_hash: receiptHash,
        completed_at: new Date().toISOString(),
      },
    });
    await grantSkinEntitlementInTx(tx, {
      userId: input.userId,
      entitlementKey: order.entitlement_key,
      sourceOrderId: order.id,
    });
    return done;
  });
}

export type GetSkinOrderInput = Readonly<{
  userId: string;
  orderId: string;
  platform: ClientPlatform;
}>;

// 查单（支付中断恢复轮询）：订单状态 + 权益是否已生效。跨用户一律 404。
export async function getSkinOrder(input: GetSkinOrderInput): Promise<SkinOrderView> {
  const order = await findSkinOrderById(input.orderId);
  if (!order || order.user_id !== input.userId) {
    throw new ApiError(404, 'ORDER_NOT_FOUND', '订单不存在');
  }
  const product = await findSkinProductBySkinId(order.skin_id);
  if (!product) throw new ApiError(404, 'SKIN_PRODUCT_NOT_FOUND', '皮肤商品不存在');
  const entitled = await hasActiveSkinEntitlement(input.userId, order.entitlement_key);
  return toSkinOrderView(order, product, product.slug, resolveStoreProductId(product, input.platform), entitled);
}

export type RestoreSkinPurchasesInput = Readonly<{
  appId: string;
  environment: string;
  userId: string;
  receipts: readonly unknown[];
  platform: ClientPlatform;
}>;

// 恢复购买：对每张票据做 verify（无 orderId 形态——原生 restore 返回的收据
// 自带 productId/transactionId）；单张失败不中断其余。权益表是所有权唯一
// 事实：已拥有（active）的商品直接跳过，不重复打商店 API。
export async function restoreSkinPurchases(
  input: RestoreSkinPurchasesInput,
): Promise<void> {
  for (const receipt of input.receipts) {
    try {
      const r = (receipt ?? {}) as { productId?: string };
      if (!r.productId) continue;
      // 票据 productId 与本店商品无关联（可能是会员商品）→ 静默跳过。
      // store_product_ids 是 JSON 文本，contains 做子串匹配即可定位候选。
      const productRow = await getDb().skinProduct.findFirst({
        where: { store_product_ids: { contains: r.productId } },
      });
      if (!productRow) continue;
      const product = await findSkinProductBySkinId(productRow.skin_id);
      if (!product) continue;
      if (await hasActiveSkinEntitlement(input.userId, product.entitlementKey)) continue;
      const provider = paymentProviderForPlatform(product.provider, input.platform, input.environment);
      const result = await provider.verifyReceipt({
        appId: input.appId,
        userId: input.userId,
        receipt,
      });
      if (!result.ok) continue;
      const receiptHash = createHash('sha256').update(JSON.stringify(receipt)).digest('hex');
      await getDb().$transaction(async (tx) => {
        await grantSkinEntitlementInTx(tx, {
          userId: input.userId,
          entitlementKey: product.entitlementKey,
          sourceOrderId: `restore-${receiptHash.slice(0, 24)}`,
        });
      });
    } catch {
      // 单张票据失败不中断其余
    }
  }
}

// 下单幂等键：客户端未携带时服务端生成（仍保证同键同单）。
export function newSkinOrderIdempotencyKey(): string {
  return `skin-order-${randomUUID()}`;
}
