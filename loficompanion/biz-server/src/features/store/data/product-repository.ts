import { getDb } from '@/db';
import type { SkinProduct } from '@prisma/client';

// 皮肤商品目录数据访问（P4 自基础设施 auth 迁入）：价格/权益键是商店目录与
// 门禁依据；status 只在 active 集合内售卖/展示，下架（inactive）商品从目录
// 消失且不可下单。未登录可浏览（价格是目录数据）。provider 是业务启用标识
//（'mock'=模拟支付；'store'=原生商店 IAP，验证按客户端平台分流）。

/** 目录/订单流使用的 camelCase 视图（wire shape 与基础设施版逐字段对齐）。 */
export interface SkinProductView {
  id: string;
  skinId: string;
  slug: string;
  skinName: string;
  accessType: string;
  entitlementKey: string;
  storeProductIds: Record<string, string>;
  priceMinor: number;
  currency: string;
  status: string;
  provider: string;
  /** 限时发售窗口（ISO；null=无窗口）。窗口过滤在客户端——目录不过滤 */
  availableFrom: string | null;
  availableUntil: string | null;
  /** Plus 会员价（分；null=无折扣 SKU） */
  plusPriceMinor: number | null;
}

function toView(row: SkinProduct): SkinProductView {
  let storeProductIds: Record<string, string> = {};
  try {
    const parsed = JSON.parse(row.store_product_ids) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      storeProductIds = parsed as Record<string, string>;
    }
  } catch {
    storeProductIds = {};
  }
  return {
    id: row.id,
    skinId: row.skin_id,
    slug: row.slug,
    skinName: row.skin_name,
    accessType: row.access_type,
    entitlementKey: row.entitlement_key,
    storeProductIds,
    priceMinor: row.price_minor,
    currency: row.currency,
    status: row.status,
    provider: row.provider,
    availableFrom: row.available_from ?? null,
    availableUntil: row.available_until ?? null,
    plusPriceMinor: row.plus_price_minor ?? null,
  };
}

/** 在售商品目录（上架时间序）。只过滤商品状态；皮肤审核态不影响目录语义。 */
export async function listSkinProducts(): Promise<SkinProductView[]> {
  const rows = await getDb().skinProduct.findMany({
    where: { status: 'active' },
    orderBy: { created_at: 'asc' },
  });
  return rows.map(toView);
}

export async function findSkinProductBySkinId(skinId: string): Promise<SkinProductView | undefined> {
  const row = await getDb().skinProduct.findUnique({ where: { skin_id: skinId } });
  return row ? toView(row) : undefined;
}

/** 批量按 skin_id 取商品（订单中心列表装配用；一次查询，无 N+1）。 */
export async function findSkinProductsBySkinIds(
  skinIds: readonly string[],
): Promise<SkinProductView[]> {
  if (skinIds.length === 0) return [];
  const rows = await getDb().skinProduct.findMany({
    where: { skin_id: { in: [...skinIds] } },
  });
  return rows.map(toView);
}

/** 发布/登记通道的幂等 upsert：未提供的 provider/storeProductIds/窗口保留现值。 */
export async function upsertSkinProduct(input: {
  skinId: string;
  slug: string;
  skinName: string;
  accessType: string;
  entitlementKey: string;
  priceMinor: number;
  currency: string;
  provider?: string;
  storeProductIds?: Record<string, string>;
  /** 限时窗口：undefined=保留现值；null=显式清除 */
  availableFrom?: string | null;
  availableUntil?: string | null;
  /** Plus 会员价：undefined=保留现值；null=清除折扣 */
  plusPriceMinor?: number | null;
}): Promise<void> {
  const now = new Date().toISOString();
  const existing = await getDb().skinProduct.findUnique({ where: { skin_id: input.skinId } });
  const storeProductIds = JSON.stringify(input.storeProductIds ?? {});
  if (existing) {
    await getDb().skinProduct.update({
      where: { skin_id: input.skinId },
      data: {
        slug: input.slug,
        skin_name: input.skinName,
        access_type: input.accessType,
        entitlement_key: input.entitlementKey,
        price_minor: input.priceMinor,
        currency: input.currency,
        status: 'active',
        updated_at: now,
        // 支付/运营配置是运维态：调用方未显式提供时保留库内现值
        ...(input.provider !== undefined ? { provider: input.provider } : {}),
        ...(input.storeProductIds !== undefined ? { store_product_ids: storeProductIds } : {}),
        ...(input.availableFrom !== undefined ? { available_from: input.availableFrom } : {}),
        ...(input.availableUntil !== undefined ? { available_until: input.availableUntil } : {}),
        ...(input.plusPriceMinor !== undefined ? { plus_price_minor: input.plusPriceMinor } : {}),
      },
    });
    return;
  }
  await getDb().skinProduct.create({
    data: {
      id: `skin-product-${input.slug}`,
      skin_id: input.skinId,
      slug: input.slug,
      skin_name: input.skinName,
      access_type: input.accessType,
      entitlement_key: input.entitlementKey,
      store_product_ids: storeProductIds,
      price_minor: input.priceMinor,
      currency: input.currency,
      status: 'active',
      provider: input.provider ?? 'store',
      available_from: input.availableFrom ?? null,
      available_until: input.availableUntil ?? null,
      plus_price_minor: input.plusPriceMinor ?? null,
      created_at: now,
      updated_at: now,
    },
  });
}
