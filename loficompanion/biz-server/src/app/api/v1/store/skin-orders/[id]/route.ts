import type { NextRequest } from 'next/server';
import { handleError, ok } from '@/lib/http';
import { requireIdentity } from '@/lib/identity';
import { getClientPlatform } from '@/lib/client-platform';
import { getSkinOrder } from '@/features/store/data/order-service';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

// 查单（支付中断恢复，docs/05 §5）：订单状态 + 皮肤权益是否已生效；
// 验证完成走 POST /api/v1/purchases/verify（biz 版 skin-only verify）。
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const identity = await requireIdentity(request);
    const { id } = await context.params;
    const order = await getSkinOrder({
      userId: identity.userId,
      orderId: id,
      platform: getClientPlatform(request),
    });
    return ok(order);
  } catch (error) {
    return handleError(error);
  }
}
