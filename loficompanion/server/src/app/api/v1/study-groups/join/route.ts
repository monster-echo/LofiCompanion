import { NextRequest } from 'next/server';
import { requireAuth } from '@/server/auth';
import { ApiError, handleError, ok } from '@/server/http';
import { joinGroup } from '@/features/leaderboards/data/group-service';

export const dynamic = 'force-dynamic';

// POST /api/v1/study-groups/join —— 入组（幂等：重复加入返回既有身份）。
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const body = (await request.json()) as { code?: string };
    if (!body.code || typeof body.code !== 'string' || body.code.trim() === '') {
      throw new ApiError(422, 'VALIDATION_ERROR', '缺少加入码');
    }
    const result = await joinGroup(user.id, body.code);
    return ok({ group: result.group, alreadyMember: result.alreadyMember });
  } catch (error) {
    return handleError(error);
  }
}
