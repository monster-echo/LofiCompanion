import { NextRequest } from 'next/server';
import { signUp } from '@/server/auth';
import { handleError, ok } from '@/server/http';
import { signUpSchema } from '@/server/schemas';
import { getClientContext } from '@/server/client-context';

export async function POST(request: NextRequest) {
  try {
    const input = signUpSchema.parse(await request.json());
    return ok(await signUp({ ...input, appId: getClientContext(request).appId }), 201);
  } catch (error) {
    return handleError(error);
  }
}
