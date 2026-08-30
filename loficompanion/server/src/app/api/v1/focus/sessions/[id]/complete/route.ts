import { NextRequest } from 'next/server';
import { requireAuth } from '@/server/auth';
import { ApiError, handleError, ok } from '@/server/http';
import { settleAndFinishSession } from '@/features/focus/data/focus-repository';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

// POST /api/v1/focus/sessions/{id}/complete —— 服务端结算。
// Idempotency-Key 头（缺省用 complete:{id}）保证同一请求重放只结算一次
// （docs/06 P0-B 验收：重放十次只产生一次结算与一次成就发放）。
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await context.params;
    const body = (await request.json()) as {
      pauses?: Array<{ start: number; end: number }>;
      completedAt?: number;
      outcome?: 'completed' | 'abandoned';
    };
    if (!Array.isArray(body.pauses) || typeof body.completedAt !== 'number') {
      throw new ApiError(422, 'VALIDATION_ERROR', '缺少 pauses 或 completedAt');
    }
    const { session, replayed } = await settleAndFinishSession(
      id,
      user.id,
      {
        pauses: body.pauses,
        completedAt: body.completedAt,
        outcome: body.outcome ?? 'completed',
      },
      request.headers.get('Idempotency-Key'),
    );
    return ok({ session, replayed });
  } catch (error) {
    return handleError(error);
  }
}
