import { NextRequest } from 'next/server';
import { verifyEmail } from '@/server/email-verification';
import { handleError, ok } from '@/server/http';
import { verifyEmailSchema } from '@/server/schemas';
import { getClientContext } from '@/server/client-context';

export async function POST(request: NextRequest) {
  try {
    const input = verifyEmailSchema.parse(await request.json());
    return ok(await verifyEmail(getClientContext(request).appId, input.email, input.code));
  } catch (error) {
    return handleError(error);
  }
}
