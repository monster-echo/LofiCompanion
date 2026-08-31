import type { NextRequest } from 'next/server';
import { ApiError, handleError, ok } from '@/lib/http';
import { extractBearerToken, verifyAccessToken } from '@/auth/jwt';
import { getAppId } from '@/env';
import { getCurrentManifest } from '@/features/skins/data/repository';

type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = 'force-dynamic';

// GET /api/v1/skins/{id}/manifest —— 当前版本 manifest（版本只增不改，docs/04 §2）。
// 支持 id 或 slug。未登录可取免费皮肤；付费/订阅皮肤由 repository 门禁校验权益
// （docs/05 §8）：匿名/无效 token 401、登录但无权益 403 SKIN_NOT_ENTITLED。
// biz 差异：权益查询转发用户 Bearer 到 auth /membership/entitlements（原为
// 本地 user_entitlements 表）。
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const token = extractBearerToken(request.headers.get('authorization'));
    let auth = null;
    if (token !== null) {
      const identity = await verifyAccessToken(token);
      // 带 token 但验签失败/租户不符 → 视为无效凭证（401），不能当匿名浏览
      if (identity === null || identity.appId !== getAppId()) {
        throw new ApiError(401, 'UNAUTHORIZED', '缺少有效访问令牌');
      }
      auth = { userId: identity.userId, authorization: request.headers.get('authorization') ?? '' };
    }
    const envelope = await getCurrentManifest(id, auth);
    return ok(envelope);
  } catch (error) {
    return handleError(error);
  }
}
