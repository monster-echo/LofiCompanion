import { NextRequest } from 'next/server';
import { requireAuth } from '@/server/auth';
import { handleError, ok } from '@/server/http';
import { listHistory } from '@/features/focus/data/focus-repository';

export const dynamic = 'force-dynamic';

// GET /api/v1/focus/history —— 已结束会话（completed + abandoned）。
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const sessions = await listHistory(user.id);
    return ok({ sessions });
  } catch (error) {
    return handleError(error);
  }
}
