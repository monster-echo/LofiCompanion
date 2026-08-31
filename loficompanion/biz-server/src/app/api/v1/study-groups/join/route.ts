import type { NextRequest } from 'next/server';
import { ApiError, handleError, ok } from '@/lib/http';
import { requireIdentity } from '@/lib/identity';
import { joinGroup } from '@/features/leaderboards/data/group-service';

export const dynamic = 'force-dynamic';

// POST /api/v1/study-groups/join —— 入组（幂等：重复加入返回既有身份）。
export async function POST(request: NextRequest) {
  try {
    const identity = await requireIdentity(request);
    const body = (await request.json()) as { code?: string };
    if (!body.code || typeof body.code !== 'string' || body.code.trim() === '') {
      throw new ApiError(422, 'VALIDATION_ERROR', '缺少加入码');
    }
    const result = await joinGroup(identity.userId, body.code);
    return ok({ group: result.group, alreadyMember: result.alreadyMember });
  } catch (error) {
    return handleError(error);
  }
}
