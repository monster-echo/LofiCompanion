import { NextRequest } from 'next/server';
import { requireAuth } from '@/server/auth';
import { handleError, ok } from '@/server/http';
import { createSkinOrder, newSkinOrderIdempotencyKey } from '@/features/skins/data/order-service';
import { skinOrderSchema } from '@/server/schemas';

// 幂等下单（docs/05 §5）：body { skinId }（id 或 slug）；客户端携带
// Idempotency-Key 时同键同单，未携带由服务端生成。中断恢复轮询见 GET [id]。
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const input = skinOrderSchema.parse(await request.json());
    const idempotencyKey = request.headers.get('idempotency-key')?.trim()
      || newSkinOrderIdempotencyKey();
    const order = await createSkinOrder({
      userId: user.id, skinId: input.skinId, idempotencyKey,
    });
    return ok(order, 201);
  } catch (error) {
    return handleError(error);
  }
}
