import { NextRequest } from 'next/server';
import { requireAuth } from '@/server/auth';
import { handleError, ok } from '@/server/http';
import { currentWeekId, groupLeaderboard } from '@/features/leaderboards/data/score-repository';

export const dynamic = 'force-dynamic';

// GET /api/v1/leaderboards/groups/{id}?week=YYYY-Www —— 组周榜（仅成员；
// 非成员 403 GROUP_FORBIDDEN；同隐私语义；周末后惰性返回组共享不可变快照）。
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { user } = await requireAuth(request);
    const week = request.nextUrl.searchParams.get('week') ?? currentWeekId();
    const view = await groupLeaderboard(id, user.id, week);
    return ok(view);
  } catch (error) {
    return handleError(error);
  }
}
