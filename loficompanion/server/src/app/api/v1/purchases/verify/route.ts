import { NextRequest } from 'next/server';
import { requireAuth } from '@/server/auth';
import { getClientContext } from '@/server/client-context';
import { getRuntimeConfig } from '@/server/database';
import { handleError, ok } from '@/server/http';
import { verifyPurchase } from '@/server/order-service';
import { verifyPurchaseSchema } from '@/server/schemas';

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const client = getClientContext(request);
    const input = verifyPurchaseSchema.parse(await request.json());
    const config = await getRuntimeConfig(user.app_id, client.environment);
    const order = await verifyPurchase({
      appId: user.app_id, environment: client.environment, userId: user.id,
      orderId: input.orderId, receipt: input.receipt, platform: client.platform, config,
    });
    return ok(order);
  } catch (error) {
    return handleError(error);
  }
}
