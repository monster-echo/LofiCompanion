import type { NextRequest } from 'next/server';
import { handleError, ok } from '@/lib/http';
import { requireIdentity } from '@/lib/identity';
import { weeklySummary } from '@/features/focus/data/repository';

// GET /api/v1/focus/weekly-summary —— 今日/本周汇总（周一界 UTC+8，与客户端同口径）。
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const identity = await requireIdentity(request);
    const summary = await weeklySummary(identity.userId, Date.now());
    return ok(summary);
  } catch (error) {
    return handleError(error);
  }
}
