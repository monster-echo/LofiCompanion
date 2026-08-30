import { NextRequest } from 'next/server';
import { requireAuth } from '@/server/auth';
import { ApiError, handleError, ok } from '@/server/http';
import { acceptInvitation } from '@/features/leaderboards/data/friend-service';

export const dynamic = 'force-dynamic';

// POST /api/v1/friends/invitations/accept —— 兑码建立双向好友（幂等）。
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const body = (await request.json()) as { code?: string };
    if (!body.code || typeof body.code !== 'string' || body.code.trim() === '') {
      throw new ApiError(422, 'VALIDATION_ERROR', '缺少邀请码');
    }
    const result = await acceptInvitation(user.id, body.code);
    return ok({ accepted: true, alreadyFriends: result.alreadyFriends, friend: result.friend });
  } catch (error) {
    return handleError(error);
  }
}
