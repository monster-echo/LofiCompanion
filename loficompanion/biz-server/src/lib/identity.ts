import type { NextRequest } from 'next/server';
import { ApiError } from './http';
import { extractBearerToken, verifyAccessToken, type BizIdentity } from '../auth/jwt';
import { getAppId } from '../env';

/**
 * 路由鉴权（对齐基础设施 requireAuth 的调用形态）：
 * 本地验签 Bearer token（auth.zhongbei.tech JWKS），并校验 token 的 app_id
 * 与本服务租户一致——防止把其他 landing app 的 token 当本 app 身份使用。
 */
export async function requireIdentity(request: NextRequest): Promise<BizIdentity> {
  const identity = await verifyAccessToken(extractBearerToken(request.headers.get('authorization')));
  if (identity === null) {
    throw new ApiError(401, 'UNAUTHORIZED', '缺少有效访问令牌');
  }
  if (identity.appId !== getAppId()) {
    throw new ApiError(403, 'APP_MISMATCH', '令牌与本服务租户不匹配');
  }
  return identity;
}
