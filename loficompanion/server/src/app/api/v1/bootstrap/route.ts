import { NextRequest } from 'next/server';
import { requireAuth, toPublicUser } from '@/server/auth';
import { getRuntimeConfig } from '@/server/database';
import { handleError, ok } from '@/server/http';
import {
  configuredProviders,
  providerPolicy,
  publicProviderConfig,
} from '@/server/social-auth';
import { getClientContext } from '@/server/client-context';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const client = getClientContext(request);
    const config = await getRuntimeConfig(client.appId, client.environment);
    let user = null;
    try {
      user = toPublicUser((await requireAuth(request)).user);
    } catch {
      user = null;
    }
    return ok({
      config,
      user,
      authProviders: configuredProviders(config, client.platform),
      authProviderPolicy: providerPolicy(config, client.platform),
      authProviderConfig: publicProviderConfig(config, client.platform),
      client,
      serverTime: new Date().toISOString(),
      apiVersion: 'v1',
    });
  } catch (error) {
    return handleError(error);
  }
}
