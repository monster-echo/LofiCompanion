import type { NextRequest } from 'next/server';
import { handleError, ok } from '@/lib/http';
import { requireIdentity } from '@/lib/identity';
import { getGroup } from '@/features/leaderboards/data/group-service';

type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = 'force-dynamic';

// GET /api/v1/study-groups/{id} —— 组信息 + 成员（含角色）+ 周目标 + 本周组总分钟
// + 在线专注人数（仅成员可见；非成员 403 GROUP_FORBIDDEN）。
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const identity = await requireIdentity(request);
    const detail = await getGroup(id, identity.userId);
    return ok(detail);
  } catch (error) {
    return handleError(error);
  }
}
