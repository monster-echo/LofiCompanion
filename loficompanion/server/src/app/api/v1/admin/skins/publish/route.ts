import { NextRequest } from 'next/server';
import { z } from 'zod';
import { adminContext } from '@/server/admin-auth';
import { handleError, ok } from '@/server/http';
import { publishSkin } from '@/features/skins/data/skin-publish-service';

const publishSchema = z.object({
  slug: z.string().min(2).max(64),
  name: z.string().min(1).max(80),
  accessType: z.enum(['free', 'paid', 'premium']),
  manifest: z.record(z.string(), z.unknown()),
  priceMinor: z.number().int().positive().optional(),
  currency: z.string().min(1).max(8).optional(),
  entitlementKey: z.string().min(1).max(120).optional(),
});

// 皮肤发布（免审核发新皮肤的写入通道）。发布脚本/控制台先经
// admin/skins/assets 直传海报，再携 manifest（posterUrl=裸 objectKey）调本端点。
export async function POST(request: NextRequest) {
  try {
    const { admin, scope } = await adminContext(request);
    const input = publishSchema.parse(await request.json());
    const result = await publishSkin(
      scope,
      input,
      request.headers.get('x-admin-actor') ?? admin.username,
    );
    return ok(result);
  } catch (error) {
    return handleError(error);
  }
}
