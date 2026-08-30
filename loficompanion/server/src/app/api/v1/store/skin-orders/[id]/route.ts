import { NextRequest } from 'next/server';
import { requireAuth } from '@/server/auth';
import { handleError, ok } from '@/server/http';
import { getSkinOrder } from '@/features/skins/data/order-service';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

// 查单（支付中断恢复，docs/05 §5）：订单状态 + 皮肤权益是否已生效；
// 验证完成走 POST /purchases/verify（skin_orders 绑定的订单服务端自动识别）。
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await context.params;
    const order = await getSkinOrder({ userId: user.id, orderId: id });
    return ok(order);
  } catch (error) {
    return handleError(error);
  }
}
