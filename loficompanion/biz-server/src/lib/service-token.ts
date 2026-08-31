import { ApiError } from './http';
import { getAuthInternalBaseUrl, getInternalClientId, getInternalClientSecret } from '../env';

// 服务间 client credentials 换 token（RFC 6749 §4.4）：POST
// {AUTH_INTERNAL_BASE_URL}/api/v1/internal/token，Basic 鉴权，form 编码。
// 按 scope 各自缓存（profiles:read / store:write …），有效期剩 60s 以内即
// 预刷新，并发单飞（同一 scope 的并发请求合并为一次换 token）。
// auth 侧契约：server/src/server/service-clients.ts（RS256，typ=service，
// audience=internal，默认 1h）。

interface CachedToken {
  token: string;
  expiresAt: number;
}

const REFRESH_MARGIN_MS = 60_000;

const cacheByScope = new Map<string, CachedToken>();
const inflightByScope = new Map<string, Promise<string>>();

async function fetchServiceToken(scope: string): Promise<string> {
  const body = new URLSearchParams({ grant_type: 'client_credentials', scope });
  const basic = Buffer.from(`${getInternalClientId()}:${getInternalClientSecret()}`).toString('base64');
  let response: Response;
  try {
    response = await fetch(`${getAuthInternalBaseUrl()}/api/v1/internal/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Basic ${basic}` },
      body,
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(502, 'SERVICE_TOKEN_UNAVAILABLE', '服务令牌获取失败', true);
  }
  if (!response.ok) {
    throw new ApiError(502, 'SERVICE_TOKEN_UNAVAILABLE', '服务令牌获取失败', true);
  }
  const payload = (await response.json()) as { access_token?: string; expires_in?: number };
  if (typeof payload.access_token !== 'string') {
    throw new ApiError(502, 'SERVICE_TOKEN_UNAVAILABLE', '服务令牌响应无效', true);
  }
  const ttlMs = (typeof payload.expires_in === 'number' ? payload.expires_in : 3600) * 1000;
  cacheByScope.set(scope, { token: payload.access_token, expiresAt: Date.now() + ttlMs });
  return payload.access_token;
}

/** 取指定 scope 的服务 token（缓存优先，剩 60s 内单飞刷新）。 */
export async function getServiceToken(scope: string): Promise<string> {
  const cached = cacheByScope.get(scope);
  if (cached && cached.expiresAt - Date.now() > REFRESH_MARGIN_MS) return cached.token;
  const inflight = inflightByScope.get(scope);
  if (inflight) return inflight;
  const promise = fetchServiceToken(scope).finally(() => {
    inflightByScope.delete(scope);
  });
  inflightByScope.set(scope, promise);
  return promise;
}
