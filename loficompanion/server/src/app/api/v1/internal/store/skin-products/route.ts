import { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleError, ok } from '@/server/http';
import { ApiError } from '@/server/http';
import { database, nowIso } from '@/server/database';
import { verifyServiceToken } from '@/server/service-clients';

// 服务间商品目录登记（biz-server 专用）：skins 目录迁 biz 后，付费皮肤的商品
// 行（定价/权益键/展示字段）仍归支付域（auth）。biz 发布 paid 皮肤时经此端点
// 幂等 upsert；商店目录/订单/校验流程零改动（展示字段已反范式化在商品行内）。
// 鉴权 = 服务 token（scope 须含 store:write）。

const upsertSchema = z.object({
  skinId: z.string().min(1).max(80),
  slug: z.string().min(2).max(64),
  skinName: z.string().min(1).max(80),
  accessType: z.enum(['free', 'paid', 'premium']),
  entitlementKey: z.string().min(1).max(120),
  priceMinor: z.number().int().min(0),
  currency: z.string().min(1).max(8).default('CNY'),
});

export async function POST(request: NextRequest) {
  try {
    const service = await verifyServiceToken(
      request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '',
      'store:write',
    );
    if (!service) {
      throw new ApiError(401, 'UNAUTHORIZED', '需要有效的服务令牌（scope: store:write）');
    }
    const input = upsertSchema.parse(await request.json());
    const now = nowIso();
    await database.prepare(
      `INSERT INTO skin_products(id, skin_id, slug, skin_name, access_type, entitlement_key,
                                 store_product_ids, price_minor, currency, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, '{}', ?, ?, 'active', ?, ?)
       ON CONFLICT (skin_id) DO UPDATE SET
         slug = excluded.slug, skin_name = excluded.skin_name, access_type = excluded.access_type,
         entitlement_key = excluded.entitlement_key, price_minor = excluded.price_minor,
         currency = excluded.currency, status = 'active', updated_at = excluded.updated_at`,
    ).run(
      `skin-product-${input.slug}`, input.skinId, input.slug, input.skinName, input.accessType,
      input.entitlementKey, input.priceMinor, input.currency, now, now,
    );
    return ok({ registered: true, skinId: input.skinId, slug: input.slug });
  } catch (error) {
    return handleError(error);
  }
}
