// 业务鉴权：本地验签 auth.zhongbei.tech 签发的 RS256 access token。
// 公钥经 GET {AUTH_BASE_URL}/api/v1/auth/jwks 拉取并由 jose 缓存，
// 运行时对基础设施零回调；签发端契约见 server/src/server/jwt.ts：
//   claims: sub = user_id, app_id, sid；iss = AUTH_BASE_URL；aud = JWT_AUDIENCE；exp = 30min。
import { createRemoteJWKSet, jwtVerify } from 'jose';

import { AUTH_BASE_URL, JWT_AUDIENCE } from '../env';

export type BizIdentity = Readonly<{
  userId: string;
  appId: string;
  sessionId: string;
}>;

const jwks = createRemoteJWKSet(new URL(`${AUTH_BASE_URL}/api/v1/auth/jwks`));

export async function verifyAccessToken(token: string | null): Promise<BizIdentity | null> {
  if (token === null) return null;
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: AUTH_BASE_URL,
      audience: JWT_AUDIENCE,
      algorithms: ['RS256'],
    });
    const userId = payload.sub;
    const appId = payload.app_id;
    const sessionId = payload.sid;
    if (
      typeof userId !== 'string' ||
      typeof appId !== 'string' ||
      typeof sessionId !== 'string'
    ) {
      return null;
    }
    return { userId, appId, sessionId };
  } catch {
    return null;
  }
}

/** 从 Authorization 头提取 Bearer token（供路由与测试使用）。 */
export function extractBearerToken(authorization: string | null): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return match ? (match[1] ?? null) : null;
}
