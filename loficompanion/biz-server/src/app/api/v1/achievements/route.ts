import type { NextRequest } from 'next/server';
import { handleError, ok } from '@/lib/http';
import { ACHIEVEMENT_DEFS } from '@/features/achievements/domain/rules';

export const dynamic = 'force-dynamic';

// GET /api/v1/achievements —— 成就定义目录（公开）。
export async function GET(_request: NextRequest) {
  try {
    return ok({ achievements: ACHIEVEMENT_DEFS });
  } catch (error) {
    return handleError(error);
  }
}
