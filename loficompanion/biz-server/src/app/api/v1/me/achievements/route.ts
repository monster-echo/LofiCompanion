import type { NextRequest } from 'next/server';
import { handleError, ok } from '@/lib/http';
import { requireIdentity } from '@/lib/identity';
import { listAchievementsForUser } from '@/features/achievements/data/repository';

export const dynamic = 'force-dynamic';

// GET /api/v1/me/achievements —— 定义 + 当前用户发放状态。
export async function GET(request: NextRequest) {
  try {
    const identity = await requireIdentity(request);
    const achievements = await listAchievementsForUser(identity.userId);
    return ok({ achievements });
  } catch (error) {
    return handleError(error);
  }
}
