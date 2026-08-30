import { NextRequest } from 'next/server';
import { requireAuth } from '@/server/auth';
import { handleError, ok } from '@/server/http';
import { listRoomItemsForUser } from '@/features/achievements/service';

export const dynamic = 'force-dynamic';

// GET /api/v1/me/room —— 当前用户已解锁的房间收藏物。
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const items = await listRoomItemsForUser(user.id);
    return ok({ items });
  } catch (error) {
    return handleError(error);
  }
}
