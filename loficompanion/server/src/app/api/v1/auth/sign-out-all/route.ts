import { NextRequest } from 'next/server';
import { requireAuth, revokeAllSessions } from '@/server/auth';
import { handleError, ok } from '@/server/http';

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    await revokeAllSessions(user.id);
    return ok({ signedOut: true });
  } catch (error) {
    return handleError(error);
  }
}

