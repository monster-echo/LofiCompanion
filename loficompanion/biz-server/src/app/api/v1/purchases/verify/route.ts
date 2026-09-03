import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleError, ok } from '@/lib/http';
import { requireIdentity } from '@/lib/identity';
import { getClientPlatform } from '@/lib/client-platform';
import { verifySkinOrder } from '@/features/store/data/order-service';

export const dynamic = 'force-dynamic';

const verifySkinPurchaseSchema = z.object({
  orderId: z.string().min(1).max(80),
  receipt: z.custom((v) => v !== undefined, { message: 'receipt is required' }),
});

// 皮肤订单验证（biz 版；会员购买验证仍在基础设施 auth）：
// 订单属主校验 → 商店验签（按平台分流适配器）→ 订单完成与权益发放同事务。
export async function POST(request: NextRequest) {
  try {
    const identity = await requireIdentity(request);
    const input = verifySkinPurchaseSchema.parse(await request.json());
    const order = await verifySkinOrder({
      appId: identity.appId,
      environment: request.headers.get('x-app-environment')?.trim() || 'development',
      userId: identity.userId,
      orderId: input.orderId,
      receipt: input.receipt,
      platform: getClientPlatform(request),
    });
    return ok(order);
  } catch (error) {
    return handleError(error);
  }
}
