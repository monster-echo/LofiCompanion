import type { NextRequest } from 'next/server';
import { handleError, ok } from '@/lib/http';
import { requireIdentity } from '@/lib/identity';
import { getActiveSession } from '@/features/focus/data/repository';

// GET /api/v1/focus/sessions/active —— 当前活跃会话（无则 null）。
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const identity = await requireIdentity(request);
    const session = await getActiveSession(identity.userId);
    return ok({ session });
  } catch (error) {
    return handleError(error);
  }
}
