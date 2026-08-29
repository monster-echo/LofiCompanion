import { NextRequest } from 'next/server';
import { getClientContext } from '@/server/client-context';
import { handleError, ok } from '@/server/http';
import { resetPassword } from '@/server/password-reset';
import { resetPasswordSchema } from '@/server/schemas';

export async function POST(request: NextRequest) {
  try {
    const input = resetPasswordSchema.parse(await request.json());
    const client = getClientContext(request);
    return ok(await resetPassword(client.appId, input.resetToken, input.newPassword));
  } catch (error) {
    return handleError(error);
  }
}
