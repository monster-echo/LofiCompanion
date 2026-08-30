import { NextRequest } from 'next/server';
import { requireAuth } from '@/server/auth';
import { ApiError, handleError, ok } from '@/server/http';
import {
  getOrCreateLeaderboardSettings, updateLeaderboardSettings,
} from '@/features/leaderboards/data/settings-repository';

export const dynamic = 'force-dynamic';

// GET /api/v1/me/leaderboard-privacy —— 榜单隐私设置（默认公开、未退出）。
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    return ok(await getOrCreateLeaderboardSettings(user.id));
  } catch (error) {
    return handleError(error);
  }
}

// PATCH /api/v1/me/leaderboard-privacy —— 部分更新（publicDisplay / optedOut）。
export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const body = (await request.json()) as { publicDisplay?: unknown; optedOut?: unknown };
    if (body.publicDisplay !== undefined && typeof body.publicDisplay !== 'boolean') {
      throw new ApiError(422, 'VALIDATION_ERROR', 'publicDisplay 须为布尔值');
    }
    if (body.optedOut !== undefined && typeof body.optedOut !== 'boolean') {
      throw new ApiError(422, 'VALIDATION_ERROR', 'optedOut 须为布尔值');
    }
    const settings = await updateLeaderboardSettings(user.id, {
      publicDisplay: body.publicDisplay,
      optedOut: body.optedOut,
    });
    return ok(settings);
  } catch (error) {
    return handleError(error);
  }
}
