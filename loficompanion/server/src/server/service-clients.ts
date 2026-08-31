import { createHash } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { database, nowIso } from './database';
import { getPrivateKey, getPublicKey, JWT_ALG, JWT_ISSUER, JWT_KID } from './jwt';

/**
 * 服务间 client credentials（RFC 6749 §4.4）：app 业务服务（biz-server）以
 * client_id/client_secret 换短期服务 token（RS256，typ=service，默认 1h）。
 *
 * - secret 只存 sha256（高熵随机串，快哈希可接受）；DB 永不落明文
 * - 注册走 env 引导（INTERNAL_CLIENT_ID/INTERNAL_CLIENT_SECRET，逗号前为 id
 *   时可省——单服务部署只填 SECRET，client_id 默认 lofi-biz），首次使用时幂等落库
 * - 服务 token 的 audience 固定 'internal'，与用户 token（aud=JWT_AUDIENCE）
 *   互不通用；scope 空格分隔，请求的 scope 必须是注册 scope 的子集
 */

const SERVICE_TOKEN_TTL_MS = 60 * 60 * 1000;
const SERVICE_TOKEN_AUDIENCE = 'internal';

export interface ServiceClientRow {
  client_id: string;
  secret_hash: string;
  scopes: string;
  status: string;
}

function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

/** env 引导注册（幂等）：INTERNAL_CLIENT_SECRET 存在且 DB 无此 client 时落库。 */
export async function ensureServiceClientSeed(): Promise<void> {
  const secret = process.env.INTERNAL_CLIENT_SECRET?.trim();
  if (!secret) return;
  const clientId = process.env.INTERNAL_CLIENT_ID?.trim() || 'lofi-biz';
  const seeded = await database.prepare(
    'SELECT 1 FROM service_clients WHERE client_id = ?',
  ).get(clientId);
  if (seeded) return;
  await database.prepare(
    `INSERT INTO service_clients(client_id, secret_hash, scopes, status, created_at)
     VALUES (?, ?, 'profiles:read store:write', 'active', ?)
     ON CONFLICT (client_id) DO NOTHING`,
  ).run(clientId, hashSecret(secret), nowIso());
}

async function loadClient(clientId: string): Promise<ServiceClientRow | null> {
  return await database.prepare(
    'SELECT client_id, secret_hash, scopes, status FROM service_clients WHERE client_id = ?',
  ).get(clientId) as ServiceClientRow | null;
}

export type TokenGrant =
  | { ok: true; accessToken: string; expiresIn: number; scope: string }
  | { ok: false; error: 'unsupported_grant_type' | 'invalid_client' | 'invalid_scope'; usedHeaderAuth: boolean };

/** 处理 client_credentials 授权（错误码遵循 RFC 6749 §5.2）。 */
export async function grantClientCredentials(input: {
  grantType: string | null;
  clientId: string | null;
  clientSecret: string | null;
  scope: string | null;
  usedHeaderAuth: boolean;
}): Promise<TokenGrant> {
  if (input.grantType !== 'client_credentials') {
    return { ok: false, error: 'unsupported_grant_type', usedHeaderAuth: input.usedHeaderAuth };
  }
  if (!input.clientId || !input.clientSecret) {
    return { ok: false, error: 'invalid_client', usedHeaderAuth: input.usedHeaderAuth };
  }
  await ensureServiceClientSeed();
  const client = await loadClient(input.clientId);
  if (!client || client.status !== 'active' || client.secret_hash !== hashSecret(input.clientSecret)) {
    return { ok: false, error: 'invalid_client', usedHeaderAuth: input.usedHeaderAuth };
  }
  const registered = client.scopes.split(' ').filter(Boolean);
  const requested = (input.scope ?? '').split(' ').filter(Boolean);
  const scope = requested.length ? requested : registered;
  if (requested.some((s) => !registered.includes(s))) {
    return { ok: false, error: 'invalid_scope', usedHeaderAuth: input.usedHeaderAuth };
  }
  const accessToken = await new SignJWT({ scope: scope.join(' '), typ: 'service' })
    .setProtectedHeader({ alg: JWT_ALG, kid: JWT_KID })
    .setSubject(client.client_id)
    .setIssuer(JWT_ISSUER)
    .setAudience(SERVICE_TOKEN_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(Math.floor((Date.now() + SERVICE_TOKEN_TTL_MS) / 1000))
    .sign(await getPrivateKey());
  await database.prepare(
    'UPDATE service_clients SET last_used_at = ? WHERE client_id = ?',
  ).run(nowIso(), client.client_id).catch(() => undefined);
  return { ok: true, accessToken, expiresIn: SERVICE_TOKEN_TTL_MS / 1000, scope: scope.join(' ') };
}

export type ServiceTokenPayload = Readonly<{
  clientId: string;
  scopes: readonly string[];
}>;

/** 服务 token 本地验签（auth 自身端点用）；用户 token（无 typ=service）一律拒绝。 */
export async function verifyServiceToken(
  token: string,
  requiredScope: string,
): Promise<ServiceTokenPayload | null> {
  try {
    const key = await getPublicKey();
    const { payload } = await jwtVerify(token, key, {
      issuer: JWT_ISSUER,
      audience: SERVICE_TOKEN_AUDIENCE,
      algorithms: [JWT_ALG],
    });
    if (payload.typ !== 'service' || typeof payload.sub !== 'string') return null;
    const scopes = typeof payload.scope === 'string' ? payload.scope.split(' ').filter(Boolean) : [];
    if (!scopes.includes(requiredScope)) return null;
    return { clientId: payload.sub, scopes };
  } catch {
    return null;
  }
}
