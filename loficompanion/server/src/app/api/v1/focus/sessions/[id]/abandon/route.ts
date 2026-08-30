import { NextRequest } from 'next/server';
import { requireAuth } from '@/server/auth';
import { handleError, ok } from '@/server/http';
import { settleAndFinishSession } from '@/features/focus/data/focus-repository';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

// POST /api/v1/focus/sessions/{id}/abandon —— 提前结束：保留实际时长，
// 不计入榜单（榜单口径 P0-C 在结算规则版本中判定）。
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await context.params;
    let completedAt = Date.now();
    try {
      const body = (await request.json()) as { completedAt?: number };
      if (typeof body.completedAt === 'number') completedAt = body.completedAt;
    } catch { /* 无 body 时用当前时间 */ }
    const { session, replayed } = await settleAndFinishSession(
      id,
      user.id,
      { pauses: [], completedAt, outcome: 'abandoned' },
      request.headers.get('Idempotency-Key'),
    );
    return ok({ session, replayed });
  } catch (error) {
    return handleError(error);
  }
}
