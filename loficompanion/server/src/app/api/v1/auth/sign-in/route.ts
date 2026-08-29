import { NextRequest } from 'next/server';
import { signIn } from '@/server/auth';
import { handleError, ok } from '@/server/http';
import { signInSchema } from '@/server/schemas';
import { getClientContext } from '@/server/client-context';

export async function POST(request: NextRequest) {
  try {
    const input = signInSchema.parse(await request.json());
    return ok(await signIn({ ...input, appId: getClientContext(request).appId }));
  } catch (error) {
    return handleError(error);
  }
}
