import { NextRequest } from 'next/server';
import { requireAuth, toPublicUser } from '@/server/auth';
import { handleError, ok } from '@/server/http';

export async function GET(request: NextRequest) {
  try {
    return ok(toPublicUser((await requireAuth(request)).user));
  } catch (error) {
    return handleError(error);
  }
}
