import { NextRequest } from 'next/server';
import { getClientContext } from '@/server/client-context';
import { handleError, ok } from '@/server/http';
import { verifyPasswordResetCode } from '@/server/password-reset';
import { verifyResetCodeSchema } from '@/server/schemas';

export async function POST(request: NextRequest) {
  try {
    const input = verifyResetCodeSchema.parse(await request.json());
    const client = getClientContext(request);
    return ok(await verifyPasswordResetCode(client.appId, input.email, input.code));
  } catch (error) {
    return handleError(error);
  }
}
