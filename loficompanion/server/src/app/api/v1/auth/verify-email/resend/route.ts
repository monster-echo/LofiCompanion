import { NextRequest } from 'next/server';
import { requestEmailVerificationResend } from '@/server/email-verification';
import { handleError, ok } from '@/server/http';
import { resendVerifyEmailSchema } from '@/server/schemas';
import { getClientContext } from '@/server/client-context';

export async function POST(request: NextRequest) {
  try {
    const input = resendVerifyEmailSchema.parse(await request.json());
    return ok(await requestEmailVerificationResend(getClientContext(request).appId, input.email));
  } catch (error) {
    return handleError(error);
  }
}
