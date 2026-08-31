import type { NextRequest } from 'next/server';
import { handleError, ok } from '@/lib/http';
import { requireIdentity } from '@/lib/identity';
import { listFriends } from '@/features/leaderboards/data/friend-service';

export const dynamic = 'force-dynamic';

// GET /api/v1/friends —— 好友列表（昵称/头像 + 本周分钟；不含任务正文）。
export async function GET(request: NextRequest) {
  try {
    const identity = await requireIdentity(request);
    const friends = await listFriends(identity.userId);
    return ok({ friends });
  } catch (error) {
    return handleError(error);
  }
}
