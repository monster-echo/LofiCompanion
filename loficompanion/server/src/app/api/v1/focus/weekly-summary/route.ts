import { NextRequest } from 'next/server';
import { requireAuth } from '@/server/auth';
import { handleError, ok } from '@/server/http';
import { weeklySummary } from '@/features/focus/data/focus-repository';

export const dynamic = 'force-dynamic';

// GET /api/v1/focus/weekly-summary —— 今日/本周汇总（周一界 UTC+8，与客户端同口径）。
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const summary = await weeklySummary(user.id, Date.now());
    return ok(summary);
  } catch (error) {
    return handleError(error);
  }
}
