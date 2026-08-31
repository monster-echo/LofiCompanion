import { NextRequest, NextResponse } from 'next/server';
import { grantClientCredentials } from '@/server/service-clients';

// RFC 6749 §4.4 Client Credentials Grant：
//   POST /api/v1/internal/token
//   Content-Type: application/x-www-form-urlencoded（兼容 JSON）
//   grant_type=client_credentials & scope=profiles:read
//   客户端凭证：HTTP Basic（推荐）或 body client_id/client_secret
// 响应（§5.1）：{ access_token, token_type: 'Bearer', expires_in, scope }，
// 必须 no-store；错误（§5.2）：invalid_client / unsupported_grant_type / invalid_scope。

type ParsedCreds = {
  grantType: string | null;
  clientId: string | null;
  clientSecret: string | null;
  scope: string | null;
  usedHeaderAuth: boolean;
};

function parseForm(raw: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(raw));
}

function parseBasic(header: string | null): { id: string; secret: string } | null {
  if (!header?.startsWith('Basic ')) return null;
  try {
    const decoded = atob(header.slice(6).trim());
    const sep = decoded.indexOf(':');
    if (sep <= 0) return null;
    return { id: decoded.slice(0, sep), secret: decoded.slice(sep + 1) };
  } catch {
    return null;
  }
}

function tokenError(error: string, usedHeaderAuth: boolean, status?: number) {
  const httpStatus = status ?? (error === 'invalid_client' && usedHeaderAuth ? 401 : 400);
  const headers: Record<string, string> = { 'cache-control': 'no-store' };
  if (httpStatus === 401) headers['www-authenticate'] = 'Basic realm="zhongbei-internal"';
  return NextResponse.json({ error }, { status: httpStatus, headers });
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type') ?? '';
  const basic = parseBasic(request.headers.get('authorization'));
  let params: Record<string, string>;
  if (contentType.includes('application/json')) {
    params = await request.json().catch(() => ({}));
  } else {
    params = parseForm(await request.text());
  }
  const grant = await grantClientCredentials({
    grantType: params.grant_type ?? null,
    clientId: basic?.id ?? params.client_id ?? null,
    clientSecret: basic?.secret ?? params.client_secret ?? null,
    scope: params.scope ?? null,
    usedHeaderAuth: basic !== null,
  });
  if (!grant.ok) {
    return tokenError(grant.error, grant.usedHeaderAuth);
  }
  return NextResponse.json({
    access_token: grant.accessToken,
    token_type: 'Bearer',
    expires_in: grant.expiresIn,
    scope: grant.scope,
  }, { headers: { 'cache-control': 'no-store', pragma: 'no-cache' } });
}
