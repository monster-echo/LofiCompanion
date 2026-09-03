import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleError, ok } from '@/lib/http';
import { adminContext } from '@/lib/admin-auth';
import { publishSkin } from '@/features/skins/data/repository';

const publishSchema = z.object({
  slug: z.string().min(2).max(64),
  name: z.string().min(1).max(80),
  accessType: z.enum(['free', 'paid', 'premium']),
  manifest: z.record(z.string(), z.unknown()),
  priceMinor: z.number().int().positive().optional(),
  currency: z.string().min(1).max(8).optional(),
  entitlementKey: z.string().min(1).max(120).optional(),
  // 支付配置透传（auth 商品行登记用）：provider 是启用标识（'mock'=模拟支付，
  // 'store'=原生商店 IAP；真实适配器由 auth 按客户端平台分流）；storeProductIds
  // 为平台 SKU 映射（apple/google/hms），ASC/Play 商品就绪后重发布即激活 IAP。
  provider: z.enum(['mock', 'store', 'apple', 'google', 'hms']).optional(),
  storeProductIds: z.record(z.string().max(8), z.string().min(1).max(200)).optional(),
});

// POST /api/v1/admin/skins/publish —— 皮肤发布（免审核发新皮肤的写入通道）。
// 发布脚本/控制台先经 admin/skins/assets 直传海报，再携 manifest（posterUrl=
// 裸 objectKey）调本端点。鉴权 = x-biz-key；paid 皮肤在发布事务提交后向 auth
// 内部端点登记商品行（失败 502 STORE_REGISTRATION_FAILED，重试发布即重登记）。
export async function POST(request: NextRequest) {
  try {
    const scope = await adminContext(request);
    const input = publishSchema.parse(await request.json());
    const result = await publishSkin(
      scope,
      input,
      request.headers.get('x-admin-actor') ?? 'biz-admin',
    );
    return ok(result);
  } catch (error) {
    return handleError(error);
  }
}
