import { NextRequest } from 'next/server';
import { requireAuth, revokeSession } from '@/server/auth';
import { handleError, ok } from '@/server/http';

export async function POST(request: NextRequest) {
  try {
    const { session } = await requireAuth(request);
    await revokeSession(session.id);
    return ok({ signedOut: true });
  } catch (error) {
    return handleError(error);
  }
}

