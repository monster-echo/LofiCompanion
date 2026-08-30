import { NextRequest } from 'next/server';
import { requireAuth } from '@/server/auth';
import { ApiError, handleError, ok } from '@/server/http';
import { createGroup } from '@/features/leaderboards/data/group-service';

export const dynamic = 'force-dynamic';

const WEEK_MINUTES_MAX = 7 * 24 * 60; // 周目标上限一周

// POST /api/v1/study-groups —— 建组（owner 自动入组）。
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const body = (await request.json()) as { name?: string; weeklyGoalMinutes?: number };
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name.length < 1 || name.length > 24) {
      throw new ApiError(422, 'VALIDATION_ERROR', '小组名称须为 1–24 个字符');
    }
    const weeklyGoalMinutes = body.weeklyGoalMinutes ?? 600;
    if (
      !Number.isInteger(weeklyGoalMinutes)
      || weeklyGoalMinutes < 30 || weeklyGoalMinutes > WEEK_MINUTES_MAX
    ) {
      throw new ApiError(422, 'VALIDATION_ERROR', '周目标分钟须为 30–10080 的整数');
    }
    const { group } = await createGroup(user.id, name, weeklyGoalMinutes);
    return ok({ group }, 201);
  } catch (error) {
    return handleError(error);
  }
}
