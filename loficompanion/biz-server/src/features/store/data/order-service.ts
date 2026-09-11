import { createHash, randomUUID } from 'node:crypto';
import { ApiError } from '@/lib/apiError';
import { getDb } from '@/db';
import {
  findSkinProductBySkinId,
  findSkinProductsBySkinIds,
  type SkinProductView,
} from './product-repository';
import {
  completeSkinOrder,
  failSkinOrder,
  findSkinOrderById,
  insertSkinOrderIfAbsent,
  listSkinOrdersByUser,
  markSkinOrderProcessing,
  type SkinOrderRow,
  type SkinOrderStatus,
} from './order-repository';
import {
  grantSkinEntitlementInTx,
  hasActiveSkinEntitlement,
  listActiveSkinEntitlementKeys,
} from './entitlement-service';
import {
  fetchMembershipEntitlementKeys,
  isPlusKeys,
} from './membership-client';
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
// Plus 折扣（opts.plus）：storeProductIds 配置了 plusApple/plusGoogle 变体时
// 优先选中——双 SKU 同 entitlement key；未配置回落基础 SKU（折扣是增益不是
// 门槛，Plus 用户不因缺折扣 SKU 而买不了）。
export function resolveStoreProductId(
  product: SkinProductView,
  platform: ClientPlatform,
  opts?: Readonly<{ plus?: boolean }>,
): string {
  if (product.provider === 'mock') return product.id;
  const storeKey = storeKeyForPlatform(platform);
  if (!storeKey) throw new ApiError(404, 'PRODUCT_NOT_MAPPED', '当前平台不支持商店内购');
  const plusVariant = opts?.plus === true ? product.storeProductIds[`plus${storeKey[0].toUpperCase()}${storeKey.slice(1)}`] : undefined;
  const storeProductId = plusVariant ?? product.storeProductIds[storeKey];
  if (!storeProductId) {
    throw new ApiError(404, 'PRODUCT_NOT_MAPPED', `皮肤商品未配置 ${storeKey} 商品 ID`);
  }
  return storeProductId;
}

// 订单金额口径（与 resolveStoreProductId 同一 plus 判定结果配套调用）：
// 实际选中 plus SKU 时取 plusPriceMinor（配置缺失兜底原价），否则原价。
export function resolvePriceMinor(
  product: SkinProductView,
  opts?: Readonly<{ plus?: boolean }>,
): number {
  return opts?.plus === true && product.plusPriceMinor != null
    ? product.plusPriceMinor
    : product.priceMinor;
}

export function toSkinOrderView(
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
    // 订单行金额是真源（Plus 折扣单 = plus 价；历史单不受目录调价影响）
    priceMinor: order.amount_minor,
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
  /** 用户 Bearer（Plus 折扣判定用）；缺失/查询失败一律按非 Plus 原价下单 */
  authorization: string;
}>;

// 幂等下单：同 (user, idempotencyKey) 返回同一订单；免费皮肤/无商品/下架均拒绝。
// Plus 折扣：auth 权益查询失败降级非 Plus（原价）——下单是关键路径，不因
// 会员服务抖动失败；实际选中 SKU/金额落订单行（查单/审计不靠目录重算）。
export async function createSkinOrder(input: CreateSkinOrderInput): Promise<SkinOrderView> {
  const skin = await findSkinIdOrSlug(input.skinId);
  if (!skin) throw new ApiError(404, 'SKIN_NOT_FOUND', '皮肤不存在');
  const product = await findSkinProductBySkinId(skin.id);
  if (!product) throw new ApiError(404, 'SKIN_PRODUCT_NOT_FOUND', '该皮肤暂无在售商品');
  if (product.status !== 'active') {
    throw new ApiError(422, 'SKIN_PRODUCT_INACTIVE', '该皮肤商品已下架');
  }
  let plus = false;
  if (input.authorization) {
    try {
      plus = isPlusKeys(await fetchMembershipEntitlementKeys(input.authorization));
    } catch (error) {
      // 降级原价；留痕防客诉黑洞（「我是 Plus 为什么扣原价」）
      console.warn('[skin-order] plus entitlement lookup failed, fallback to base price', error);
    }
  }
  const storeProductId = resolveStoreProductId(product, input.platform, { plus });
  const amountMinor = resolvePriceMinor(product, { plus });

  const order = await insertSkinOrderIfAbsent({
    userId: input.userId,
    skinId: product.skinId,
    entitlementKey: product.entitlementKey,
    idempotencyKey: input.idempotencyKey,
    amountMinor,
    currency: product.currency,
    provider: product.provider,
    storeProductId: product.provider === 'mock' ? '' : storeProductId,
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

// 订单中心列表装配：订单行已存的 store_product_id 是历史真源（下单时的
// Plus 折扣 SKU/当期映射），优先回显；仅历史空行（旧单/mock）按当前目录
// 解析，目录已改/未映射时降级空串展示，绝不因装配抛错。
export function pickStoreProductId(
  order: Pick<SkinOrderRow, 'store_product_id'>,
  product: SkinProductView,
  platform: ClientPlatform,
): string {
  if (order.store_product_id) return order.store_product_id;
  if (product.provider === 'mock') return product.id;
  try {
    return resolveStoreProductId(product, platform);
  } catch {
    return '';
  }
}

export type ListSkinOrdersInput = Readonly<{
  userId: string;
  platform: ClientPlatform;
}>;

// 我的皮肤订单（订单中心数据源）：3 次查询装配（orders → 批量商品 → 拥有
// 键集），无 N+1。entitled 以当前权益表为准——退款撤销后自然回落 false；
// 商品行缺失（历史下架清表）降级为最小视图，列表不缺行。
export async function listSkinOrders(input: ListSkinOrdersInput): Promise<SkinOrderView[]> {
  const orders = await listSkinOrdersByUser(input.userId);
  if (orders.length === 0) return [];
  const products = await findSkinProductsBySkinIds([...new Set(orders.map((o) => o.skin_id))]);
  const productById = new Map(products.map((p) => [p.skinId, p]));
  const ownedKeys = new Set(await listActiveSkinEntitlementKeys(input.userId));
  return orders.map((order) => {
    const product = productById.get(order.skin_id);
    if (!product) {
      return {
        orderId: order.id,
        skinId: order.skin_id,
        slug: order.skin_id,
        entitlementKey: order.entitlement_key,
        priceMinor: order.amount_minor,
        currency: order.currency,
        status: order.status as SkinOrderStatus,
        provider: order.provider,
        storeProductId: order.store_product_id,
        createdAt: order.created_at,
        completedAt: order.completed_at,
        entitled: ownedKeys.has(order.entitlement_key),
      };
    }
    return toSkinOrderView(
      order,
      product,
      product.slug,
      pickStoreProductId(order, product, input.platform),
      ownedKeys.has(order.entitlement_key),
    );
  });
}

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
