import { NextRequest } from 'next/server';
import { requireAuth } from '@/server/auth';
import { handleError, ok } from '@/server/http';
import { getActiveSession } from '@/features/focus/data/focus-repository';

export const dynamic = 'force-dynamic';

// GET /api/v1/focus/sessions/active —— 当前活跃会话（无则 null）。
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const session = await getActiveSession(user.id);
    return ok({ session });
  } catch (error) {
    return handleError(error);
  }
}
