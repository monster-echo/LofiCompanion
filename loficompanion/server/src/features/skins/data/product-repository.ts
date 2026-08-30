import { database } from '@/server/database';

// 皮肤商品目录数据访问（docs/05 §4/§7，计划 P1-A Task 1）。
// 商品与皮肤联表暴露目录展示字段；status 只在 active 集合内售卖/展示，
// 下架（inactive）商品从目录消失且不可下单。未登录可浏览（价格是目录数据）。

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
}

interface ProductRow {
  id: string;
  skin_id: string;
  slug: string;
  name: string;
  access_type: string;
  entitlement_key: string;
  store_product_ids: string;
  price_minor: number;
  currency: string;
  status: string;
}

function toView(row: ProductRow): SkinProductView {
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
    skinName: row.name,
    accessType: row.access_type,
    entitlementKey: row.entitlement_key,
    storeProductIds,
    priceMinor: row.price_minor,
    currency: row.currency,
    status: row.status,
  };
}

const SELECT = `
  SELECT p.id, p.skin_id, s.slug, s.name, s.access_type, p.entitlement_key,
         p.store_product_ids, p.price_minor, p.currency, p.status
  FROM skin_products p
  JOIN skins s ON s.id = p.skin_id
`;

// 在售商品目录（上架时间序）。只过滤商品状态；皮肤审核态不影响目录语义
//（计划 Task 1：moderation 仍 pending_assets，仅目录语义）。
export async function listSkinProducts(): Promise<SkinProductView[]> {
  const rows = await database.prepare(
    `${SELECT} WHERE p.status = 'active' ORDER BY p.created_at`,
  ).all<ProductRow>();
  return rows.map(toView);
}

export async function findSkinProductBySkinId(skinId: string): Promise<SkinProductView | undefined> {
  const row = await database.prepare(
    `${SELECT} WHERE p.skin_id = ?`,
  ).get<ProductRow>(skinId);
  return row ? toView(row) : undefined;
}

export async function findSkinProductById(productId: string): Promise<SkinProductView | undefined> {
  const row = await database.prepare(
    `${SELECT} WHERE p.id = ?`,
  ).get<ProductRow>(productId);
  return row ? toView(row) : undefined;
}
