import { NextRequest } from 'next/server';
import { requireAuth } from '@/server/auth';
import { handleError, ok } from '@/server/http';
import { listAchievementsForUser } from '@/features/achievements/service';

export const dynamic = 'force-dynamic';

// GET /api/v1/me/achievements —— 定义 + 当前用户发放状态。
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const achievements = await listAchievementsForUser(user.id);
    return ok({ achievements });
  } catch (error) {
    return handleError(error);
  }
}
