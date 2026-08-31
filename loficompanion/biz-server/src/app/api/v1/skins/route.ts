import type { NextRequest } from 'next/server';
import { handleError, ok } from '@/lib/http';
import { listPublishedSkins } from '@/features/skins/data/repository';

export const dynamic = 'force-dynamic';

// GET /api/v1/skins —— 已发布皮肤目录（公开；未登录可浏览免费皮肤，docs/08 S14）。
export async function GET(_request: NextRequest) {
  try {
    const skins = await listPublishedSkins();
    return ok({ skins });
  } catch (error) {
    return handleError(error);
  }
}
