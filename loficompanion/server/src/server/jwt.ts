import { createPrivateKey, createPublicKey, generateKeyPairSync } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SignJWT, exportJWK, importPKCS8, importSPKI, jwtVerify } from 'jose';
import type { JWK } from 'jose';

/**
 * RS256 签名 JWT access token。私钥仅 auth 持有，业务服务经
 * GET /api/v1/auth/jwks 取公钥本地验签，零在线依赖。
 * 撤销：JWT 无状态；auth 自身端点仍按 sid 查 sessions 保证 logout
 * 即时生效，第三方业务服务按 exp（30 分钟）接受。
 */

export const JWT_ALG = 'RS256';
export const JWT_KID = 'auth-rs256-v1';
export const JWT_ISSUER =
  process.env.AUTH_JWT_ISSUER?.trim() ||
  process.env.AUTH_PUBLIC_ORIGIN?.trim() ||
  'https://auth.zhongbei.tech';
export const JWT_AUDIENCE = process.env.AUTH_JWT_AUDIENCE?.trim() || 'dsh-pocket';

const DEV_KEY_PATH = join(process.cwd(), '.dev-jwt-key.pem');

let privateKeyCache: CryptoKey | null = null;
let publicKeyCache: CryptoKey | null = null;

function normalizePem(value: string): string {
  return value.replaceAll('\\n', '\n').trim() + '\n';
}

function loadPrivateKeyPem(): string {
  const fromEnv = process.env.AUTH_JWT_PRIVATE_KEY?.trim();
  if (fromEnv) return normalizePem(fromEnv);
  if (process.env.NODE_ENV !== 'production') {
    if (existsSync(DEV_KEY_PATH)) return readFileSync(DEV_KEY_PATH, 'utf8');
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    writeFileSync(DEV_KEY_PATH, pem, { mode: 0o600 });
    return pem;
  }
  throw new Error(
    'AUTH_JWT_PRIVATE_KEY 未配置：生产环境必须提供 RS256 私钥（PEM）。' +
      '生成：openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out jwt-private.pem',
  );
}

export async function getPrivateKey(): Promise<CryptoKey> {
  if (privateKeyCache) return privateKeyCache;
  const keyObject = createPrivateKey(loadPrivateKeyPem());
  privateKeyCache = await importPKCS8(keyObject.export({ type: 'pkcs8', format: 'pem' }).toString(), JWT_ALG);
  return privateKeyCache;
}

export async function getPublicKey(): Promise<CryptoKey> {
  if (publicKeyCache) return publicKeyCache;
  const keyObject = createPrivateKey(loadPrivateKeyPem());
  const publicKeyObject = createPublicKey(keyObject);
  publicKeyCache = await importSPKI(
    publicKeyObject.export({ type: 'spki', format: 'pem' }).toString(),
    JWT_ALG,
  );
  return publicKeyCache;
}

export type AccessTokenPayload = Readonly<{
  userId: string;
  appId: string;
  sessionId: string;
}>;

export async function signAccessToken(input: {
  userId: string;
  appId: string;
  sessionId: string;
  ttlMs: number;
}): Promise<string> {
  const key = await getPrivateKey();
  return await new SignJWT({ app_id: input.appId, sid: input.sessionId })
    .setProtectedHeader({ alg: JWT_ALG, kid: JWT_KID })
    .setSubject(input.userId)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(Math.floor((Date.now() + input.ttlMs) / 1000))
    .sign(key);
}

/** 本地验签（auth 自身端点用）：过期/签名错/iss/aud 不符 → null。 */
export async function verifyAccessToken(token: string): Promise<AccessTokenPayload | null> {
  try {
    const key = await getPublicKey();
    const { payload } = await jwtVerify(token, key, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      algorithms: [JWT_ALG],
    });
    const userId = payload.sub;
    const appId = payload.app_id;
    const sessionId = payload.sid;
    if (typeof userId !== 'string' || typeof appId !== 'string' || typeof sessionId !== 'string') {
      return null;
    }
    return { userId, appId, sessionId };
  } catch {
    return null;
  }
}

/** JWKS（GET /api/v1/auth/jwks）：业务服务拉公钥用。 */
export async function getJwks(): Promise<{ keys: JWK[] }> {
  const publicKey = await getPublicKey();
  const jwk = await exportJWK(publicKey);
  return { keys: [{ ...jwk, kid: JWT_KID, alg: JWT_ALG, use: 'sig' }] };
}