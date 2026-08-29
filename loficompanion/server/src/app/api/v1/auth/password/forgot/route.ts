import { NextRequest } from 'next/server';
import { getClientContext } from '@/server/client-context';
import { handleError, ok } from '@/server/http';
import { requestPasswordReset } from '@/server/password-reset';
import { forgotPasswordSchema } from '@/server/schemas';

export async function POST(request: NextRequest) {
  try {
    const input = forgotPasswordSchema.parse(await request.json());
    const client = getClientContext(request);
    return ok(await requestPasswordReset(client.appId, input.email), 202);
  } catch (error) {
    return handleError(error);
  }
}
