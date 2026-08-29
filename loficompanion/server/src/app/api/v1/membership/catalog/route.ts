import { NextRequest } from 'next/server';
import { getClientContext } from '@/server/client-context';
import { getRuntimeConfig } from '@/server/database';
import { handleError, ok } from '@/server/http';

export async function GET(request: NextRequest) {
  try {
    const client = getClientContext(request);
    const config = await getRuntimeConfig(client.appId, client.environment);
    return ok({
      entitlements: config.entitlements,
      tiers: config.tiers,
      plans: config.plans,
    });
  } catch (error) {
    return handleError(error);
  }
}
