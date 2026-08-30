import { NextRequest } from 'next/server';
import { requireAuth } from '@/server/auth';
import { handleError, ok } from '@/server/http';
import { listFriends } from '@/features/leaderboards/data/friend-service';

export const dynamic = 'force-dynamic';

// GET /api/v1/friends —— 好友列表（昵称/头像 + 本周分钟；不含任务正文）。
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const friends = await listFriends(user.id);
    return ok({ friends });
  } catch (error) {
    return handleError(error);
  }
}
