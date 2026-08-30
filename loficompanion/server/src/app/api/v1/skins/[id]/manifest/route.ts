import { NextRequest } from 'next/server';
import { handleError, ok } from '@/server/http';
import { getCurrentManifest } from '@/features/skins/data/skin-repository';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

// 当前版本 manifest（版本只增不改，docs/04 §2）。支持 id 或 slug。
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const envelope = await getCurrentManifest(id);
    return ok(envelope);
  } catch (error) {
    return handleError(error);
  }
}
