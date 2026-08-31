import type { NextRequest } from 'next/server';
import { handleError, ok } from '@/lib/http';
import { requireIdentity } from '@/lib/identity';
import { listRoomItemsForUser } from '@/features/achievements/data/repository';

export const dynamic = 'force-dynamic';

// GET /api/v1/me/room —— 当前用户已解锁的房间收藏物。
export async function GET(request: NextRequest) {
  try {
    const identity = await requireIdentity(request);
    const items = await listRoomItemsForUser(identity.userId);
    return ok({ items });
  } catch (error) {
    return handleError(error);
  }
}
