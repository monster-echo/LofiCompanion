import { NextRequest } from 'next/server';
import { handleError, ok } from '@/server/http';
import { socialSignInSchema } from '@/server/schemas';
import { socialSignIn } from '@/server/social-auth';
import { getClientContext } from '@/server/client-context';
import { getRuntimeConfig } from '@/server/database';

export async function POST(request: NextRequest) {
  try {
    const input = socialSignInSchema.parse(await request.json());
    const client = getClientContext(request);
    const config = await getRuntimeConfig(client.appId, client.environment);
    return ok(await socialSignIn({ ...input, appId: client.appId }, config, client.platform));
  } catch (error) {
    return handleError(error);
  }
}
