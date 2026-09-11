import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleError, ok } from '@/lib/http';
import { requireIdentity } from '@/lib/identity';
import { getClientPlatform } from '@/lib/client-platform';
import { extractBearerToken } from '@/auth/jwt';
import {
  createSkinOrder,
  listSkinOrders,
  newSkinOrderIdempotencyKey,
} from '@/features/store/data/order-service';

export const dynamic = 'force-dynamic';

const skinOrderSchema = z.object({
  // skinId 接受皮肤 id 或 slug
  skinId: z.string().min(1).max(120),
});

// 我的皮肤订单（订单中心列表；created_at 倒序 ≤100，线格式同 GET [id] 的
// SkinOrderView）。
export async function GET(request: NextRequest) {
  try {
    const identity = await requireIdentity(request);
    const orders = await listSkinOrders({
      userId: identity.userId,
      platform: getClientPlatform(request),
    });
    return ok({ orders });
  } catch (error) {
    return handleError(error);
  }
}

// 幂等下单（docs/05 §5）：body { skinId }；客户端携带 Idempotency-Key 时同键
// 同单，未携带由服务端生成。中断恢复轮询见 GET [id]。
export async function POST(request: NextRequest) {
  try {
    const identity = await requireIdentity(request);
    const input = skinOrderSchema.parse(await request.json());
    const idempotencyKey = request.headers.get('idempotency-key')?.trim()
      || newSkinOrderIdempotencyKey();
    const order = await createSkinOrder({
      userId: identity.userId,
      skinId: input.skinId,
      idempotencyKey,
      platform: getClientPlatform(request),
      // 原样转发 Bearer：Plus 折扣定价在服务端判定（查询失败降级原价）
      authorization: extractBearerToken(request.headers.get('authorization')) ?? '',
    });
    return ok(order, 201);
  } catch (error) {
    return handleError(error);
  }
}
