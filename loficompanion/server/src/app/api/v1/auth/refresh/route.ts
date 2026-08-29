import { NextRequest } from 'next/server';
import { rotateRefreshToken } from '@/server/refresh';
import { handleError, ok } from '@/server/http';
import { refreshSchema } from '@/server/schemas';
import { getClientContext } from '@/server/client-context';

export async function POST(request: NextRequest) {
  try {
    const input = refreshSchema.parse(await request.json());
    return ok(await rotateRefreshToken(getClientContext(request).appId, input.refreshToken));
  } catch (error) {
    return handleError(error);
  }
}
