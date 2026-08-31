import type { NextRequest } from 'next/server';
import { handleError, ok } from '@/lib/http';
import { requireIdentity } from '@/lib/identity';
import { getOrCreateInvitationCode } from '@/features/leaderboards/data/friend-service';

export const dynamic = 'force-dynamic';

// POST /api/v1/friends/invitations —— 获取我的好友邀请码（幂等：无则生成）。
export async function POST(request: NextRequest) {
  try {
    const identity = await requireIdentity(request);
    const code = await getOrCreateInvitationCode(identity.userId);
    return ok({ code });
  } catch (error) {
    return handleError(error);
  }
}
