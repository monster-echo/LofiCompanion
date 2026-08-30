import { NextRequest } from 'next/server';
import { optionalAuth } from '@/server/auth';
import { handleError, ok } from '@/server/http';
import { getCurrentManifest } from '@/features/skins/data/skin-repository';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

// 当前版本 manifest（版本只增不改，docs/04 §2）。支持 id 或 slug。
// 未登录可取免费皮肤；付费/订阅皮肤由 repository 门禁校验权益（docs/05 §8）：
// 匿名 401、登录但无权益 403 SKIN_NOT_ENTITLED。
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const auth = await optionalAuth(request);
    const envelope = await getCurrentManifest(id, auth?.user.id);
    return ok(envelope);
  } catch (error) {
    return handleError(error);
  }
}
