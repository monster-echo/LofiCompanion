import type { NextRequest } from 'next/server';
import { handleError, ok } from '@/lib/http';
import { requireIdentity } from '@/lib/identity';
import { listHistory } from '@/features/focus/data/repository';

// GET /api/v1/focus/history —— 已结束会话（completed + abandoned）。
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const identity = await requireIdentity(request);
    const sessions = await listHistory(identity.userId);
    return ok({ sessions });
  } catch (error) {
    return handleError(error);
  }
}
