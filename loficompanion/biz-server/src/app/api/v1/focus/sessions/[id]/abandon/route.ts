import type { NextRequest } from 'next/server';
import { handleError, ok } from '@/lib/http';
import { requireIdentity } from '@/lib/identity';
import { settleAndFinishSession } from '@/features/focus/data/repository';

type RouteContext = { params: Promise<{ id: string }> };

// POST /api/v1/focus/sessions/{id}/abandon —— 提前结束：保留实际时长，
// 不计入榜单（榜单口径 P0-C 在结算规则版本中判定）。
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const identity = await requireIdentity(request);
    const { id } = await context.params;
    let completedAt = Date.now();
    try {
      const body = (await request.json()) as { completedAt?: number };
      if (typeof body.completedAt === 'number') completedAt = body.completedAt;
    } catch { /* 无 body 时用当前时间 */ }
    const { session, replayed } = await settleAndFinishSession(
      id,
      identity.userId,
      { pauses: [], completedAt, outcome: 'abandoned' },
      request.headers.get('Idempotency-Key'),
    );
    return ok({ session, replayed });
  } catch (error) {
    return handleError(error);
  }
}
