import type { NextRequest } from 'next/server';
import { handleError, ok } from '@/lib/http';
import { requireIdentity } from '@/lib/identity';
import { currentWeekId, friendsLeaderboard } from '@/features/leaderboards/data/score-repository';

export const dynamic = 'force-dynamic';

// GET /api/v1/leaderboards/friends?week=YYYY-Www —— 好友周榜（本人 + 好友；
// 每日 180 分钟上限结算；opted_out 好友消失、public_display=0 显示「已隐藏」；
// 周末后惰性返回不可变快照）。响应只含昵称/头像/分钟/名次，无任务正文。
export async function GET(request: NextRequest) {
  try {
    const identity = await requireIdentity(request);
    const week = request.nextUrl.searchParams.get('week') ?? currentWeekId();
    const view = await friendsLeaderboard(identity.userId, week);
    return ok(view);
  } catch (error) {
    return handleError(error);
  }
}
