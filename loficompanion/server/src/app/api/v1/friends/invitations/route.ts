import { NextRequest } from 'next/server';
import { requireAuth } from '@/server/auth';
import { handleError, ok } from '@/server/http';
import { getOrCreateInvitationCode } from '@/features/leaderboards/data/friend-service';

export const dynamic = 'force-dynamic';

// POST /api/v1/friends/invitations —— 获取我的好友邀请码（幂等：无则生成）。
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const code = await getOrCreateInvitationCode(user.id);
    return ok({ code });
  } catch (error) {
    return handleError(error);
  }
}
