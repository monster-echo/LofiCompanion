import type { NextRequest } from 'next/server';
import { ApiError, handleError, ok } from '@/lib/http';
import { requireIdentity } from '@/lib/identity';
import { acceptInvitation } from '@/features/leaderboards/data/friend-service';

export const dynamic = 'force-dynamic';

// POST /api/v1/friends/invitations/accept —— 兑码建立双向好友（幂等）。
export async function POST(request: NextRequest) {
  try {
    const identity = await requireIdentity(request);
    const body = (await request.json()) as { code?: string };
    if (!body.code || typeof body.code !== 'string' || body.code.trim() === '') {
      throw new ApiError(422, 'VALIDATION_ERROR', '缺少邀请码');
    }
    const result = await acceptInvitation(identity.userId, body.code);
    return ok({ accepted: true, alreadyFriends: result.alreadyFriends, friend: result.friend });
  } catch (error) {
    return handleError(error);
  }
}
