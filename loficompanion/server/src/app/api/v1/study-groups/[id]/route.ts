import { NextRequest } from 'next/server';
import { requireAuth } from '@/server/auth';
import { handleError, ok } from '@/server/http';
import { getGroup } from '@/features/leaderboards/data/group-service';

export const dynamic = 'force-dynamic';

// GET /api/v1/study-groups/{id} —— 组信息 + 成员（含角色）+ 周目标 + 本周组总分钟
// + 在线专注人数（仅成员可见；非成员 403 GROUP_FORBIDDEN）。
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { user } = await requireAuth(request);
    const detail = await getGroup(id, user.id);
    return ok(detail);
  } catch (error) {
    return handleError(error);
  }
}
