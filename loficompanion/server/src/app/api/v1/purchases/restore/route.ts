import { NextRequest } from 'next/server';
import { requireAuth } from '@/server/auth';
import { getClientContext } from '@/server/client-context';
import { getRuntimeConfig } from '@/server/database';
import { handleError, ok } from '@/server/http';
import { restorePurchases } from '@/server/order-service';
import { listActiveEntitlements } from '@/server/entitlement-service';
import { restorePurchasesSchema } from '@/server/schemas';

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const client = getClientContext(request);
    const input = restorePurchasesSchema.parse(await request.json());
    const config = await getRuntimeConfig(user.app_id, client.environment);
    await restorePurchases({
      appId: user.app_id, environment: client.environment, userId: user.id,
      receipts: input.receipts, platform: client.platform, config,
    });
    const entitlements = await listActiveEntitlements(user.id, user.app_id);
    return ok({ entitlements: entitlements.map((e) => e.entitlement_key) });
  } catch (error) {
    return handleError(error);
  }
}
