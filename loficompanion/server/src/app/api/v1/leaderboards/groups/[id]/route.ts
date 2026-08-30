import { NextRequest } from 'next/server';
import { requireAuth } from '@/server/auth';
import { handleError, ok } from '@/server/http';
import { currentWeekId } from '@/features/leaderboards/data/score-repository';
import { getGroupWeeklyView } from '@/features/leaderboards/data/weekly-settlement';

export const dynamic = 'force-dynamic';

// GET /api/v1/leaderboards/groups/{id}?week=YYYY-Www —— 组周榜 + 共同目标进度
// （仅成员；非成员 403 GROUP_FORBIDDEN；同隐私语义；周末后惰性结算：组共享
// 不可变快照 + 目标达成发放 weekly_group_photo 周结算收藏物）。
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { user } = await requireAuth(request);
    const week = request.nextUrl.searchParams.get('week') ?? currentWeekId();
    const view = await getGroupWeeklyView(id, user.id, week);
    return ok(view);
  } catch (error) {
    return handleError(error);
  }
}
