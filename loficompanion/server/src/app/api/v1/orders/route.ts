import { NextRequest } from 'next/server';
import { requireAuth } from '@/server/auth';
import { getClientContext } from '@/server/client-context';
import { getRuntimeConfig } from '@/server/database';
import { ApiError, handleError, ok } from '@/server/http';
import { createOrder, ordersForUser } from '@/server/order-service';
import { orderSchema } from '@/server/schemas';

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    return ok(await ordersForUser(user.id));
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const idempotencyKey = request.headers.get('idempotency-key');
    if (!idempotencyKey) {
      throw new ApiError(400, 'IDEMPOTENCY_REQUIRED', '缺少幂等键');
    }
    const input = orderSchema.parse(await request.json());
    const client = getClientContext(request);
    const config = await getRuntimeConfig(user.app_id, client.environment);
    const order = await createOrder({
      userId: user.id,
      idempotencyKey,
      planId: input.planId,
      platform: client.platform,
      config,
    });
    return ok(order, 201);
  } catch (error) {
    return handleError(error);
  }
}
