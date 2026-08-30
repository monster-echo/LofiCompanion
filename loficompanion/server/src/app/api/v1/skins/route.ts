import { NextRequest } from 'next/server';
import { handleError, ok } from '@/server/http';
import { listPublishedSkins } from '@/features/skins/data/skin-repository';

export const dynamic = 'force-dynamic';

// 未登录可浏览免费皮肤目录（docs/08 S14）。
export async function GET(_request: NextRequest) {
  try {
    const skins = await listPublishedSkins();
    return ok({ skins });
  } catch (error) {
    return handleError(error);
  }
}
