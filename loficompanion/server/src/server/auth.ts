import type { NextRequest } from 'next/server';
import type { PublicUser } from '@/domain/user';
import { database, getRuntimeConfig, nowIso } from './database';
import { ApiError } from './http';
import { createId } from './ids';
import { hashPassword, validatePasswordAgainstPolicy, verifyPassword } from './passwords';
import { issueSessionPair, revokeAllRefreshForUser, revokeRefreshForSession } from './session-tokens';
import { assertSignInNotLocked, recordSignInFailure, recordSignInSuccess } from './sign-in-attempts';
import { createEmailVerification } from './email-verification';
import { verifyAccessToken } from './jwt';
import { DEFAULT_APP_ID, SERVICE_NAME } from './service-identity';

type UserRow = {
  id: string;
  app_id: string;
  // 可空：手机号/华为登录账号无真实邮箱（issue #14）。
  email: string | null;
  password_hash: string;
  username: string;
  display_name: string | null;
  bio: string;
  avatar_url: string | null;
  tier_id: string;
  settings: string;
  email_verified: number;
  consent_version: string | null;
  consented_at: string | null;
  created_at: string;
  updated_at: string;
};

type SessionRow = {
  id: string;
  user_id: string;
  token_hash: string;
  device_name: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  revoked_at: string | null;
};

export type AuthContext = Readonly<{
  user: UserRow;
  session: SessionRow;
}>;

export async function signUp(input: {
  appId: string;
  email: string;
  password: string;
  username: string;
  consentVersion: string;
  deviceName: string;
}) {
  const email = input.email.trim().toLowerCase();
  const reasons = validatePasswordAgainstPolicy(
    (await getRuntimeConfig(input.appId)).auth.passwordPolicy,
    input.password,
  );
  if (reasons.length) {
    throw new ApiError(400, 'VALIDATION_ERROR', '密码不符合要求', false, { password: reasons });
  }
  const emailExists = await database.prepare(
    'SELECT 1 FROM users WHERE app_id = ? AND email = ?',
  ).get(input.appId, email);
  if (emailExists) throw new ApiError(409, 'EMAIL_EXISTS', '该邮箱已注册');
  const username = input.username.trim();
  const usernameExists = await database.prepare(
    'SELECT 1 FROM users WHERE app_id = ? AND lower(username) = ?',
  ).get(input.appId, username.toLowerCase());
  if (usernameExists) throw new ApiError(409, 'USERNAME_EXISTS', '该用户名已被使用');
  const id = createId();
  const createdAt = nowIso();
  const passwordHash = await hashPassword(input.password);
  await database.prepare(`
    INSERT INTO users(
      id, app_id, email, password_hash, username, consent_version, consented_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, input.appId, email, passwordHash, username, input.consentVersion, createdAt, createdAt, createdAt);
  await createWelcomeNotifications(id);
  await createEmailVerification(input.appId, id, email);
  return await createUserSession(id, input.appId, input.deviceName);
}

export async function signIn(input: {
  appId: string;
  identifier: string;
  password: string;
  deviceName: string;
}) {
  const identifier = input.identifier.trim();
  const normalized = identifier.toLowerCase();
  await assertSignInNotLocked(input.appId, identifier);
  const user = await findUserByIdentifier(input.appId, identifier, normalized);
  const valid = user && await verifyPassword(user.password_hash, input.password);
  if (!user || !valid) {
    await recordSignInFailure(input.appId, identifier);
    throw new ApiError(401, 'INVALID_CREDENTIALS', '账号或密码不正确');
  }
  await recordSignInSuccess(input.appId, identifier);
  return await createUserSession(user.id, input.appId, input.deviceName);
}

async function findUserByIdentifier(appId: string, identifier: string, normalized: string) {
  const direct = await database.prepare(`
    SELECT * FROM users
    WHERE app_id = ? AND (email = ? OR lower(username) = ?)
  `).get(appId, normalized, normalized) as UserRow | undefined;
  if (direct || !identifier.startsWith('+')) return direct;
  return await database.prepare(`
    SELECT users.* FROM users
    JOIN external_identities ON external_identities.user_id = users.id
    WHERE users.app_id = ?
      AND external_identities.provider = 'phone'
      AND external_identities.provider_subject = ?
  `).get(appId, `${appId}:${identifier}`) as UserRow | undefined;
}

// 可选登录（P1-A manifest 门禁）：未携带 token 视为匿名返回 undefined；携带了
// 无效/过期 token 也降级为匿名——免费资源仍可浏览（docs/08 S14），付费资源由
// manifest 门禁统一抛 401。
export async function optionalAuth(request: NextRequest): Promise<AuthContext | undefined> {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ') || !header.slice(7).trim()) return undefined;
  try {
    return await requireAuth(request);
  } catch {
    return undefined;
  }
}

export async function requireAuth(request: NextRequest): Promise<AuthContext> {
  const header = request.headers.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new ApiError(401, 'UNAUTHORIZED', '请先登录');
  const verified = await verifyAccessToken(token);
  if (!verified) throw new ApiError(401, 'SESSION_EXPIRED', '登录状态已过期');
  const session = await database.prepare(
    'SELECT * FROM sessions WHERE id = ? AND revoked_at IS NULL',
  ).get(verified.sessionId) as SessionRow | undefined;
  if (!session) throw new ApiError(401, 'SESSION_EXPIRED', '登录状态已过期');
  const user = await getUserRow(session.user_id);
  const appId = request.headers.get('x-app-id')?.trim() || DEFAULT_APP_ID;
  if (user.app_id !== appId) {
    throw new ApiError(401, 'TENANT_MISMATCH', '登录状态不属于当前应用');
  }
  await database.prepare(
    'UPDATE sessions SET last_seen_at = ? WHERE id = ?',
  ).run(nowIso(), session.id);
  return { user, session };
}

export async function revokeSession(sessionId: string) {
  await database.prepare(
    'UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL',
  ).run(nowIso(), sessionId);
  await revokeRefreshForSession(sessionId);
}

export async function revokeAllSessions(userId: string) {
  await database.prepare(
    'UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL',
  ).run(nowIso(), userId);
  await revokeAllRefreshForUser(userId);
}

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    displayName: row.display_name ?? row.username,
    bio: row.bio,
    avatarUrl: row.avatar_url,
    tierId: row.tier_id,
    settings: JSON.parse(row.settings) as Record<string, string | boolean | number>,
    emailVerified: row.email_verified === 1,
    consentVersion: row.consent_version,
    createdAt: row.created_at,
    // 华为/手机号登录生成伪邮箱（xxx@phone.invalid / xxx@invalid.local），不算真实邮箱
    hasEmail: row.email !== null && !row.email.endsWith('@phone.invalid') &&
      !row.email.endsWith('@invalid.local'),
  };
}

export async function getUserRow(userId: string) {
  const user = await database.prepare(
    'SELECT * FROM users WHERE id = ?',
  ).get(userId) as UserRow | undefined;
  if (!user) throw new ApiError(401, 'USER_NOT_FOUND', '账号不存在');
  return user;
}

export async function createUserSession(userId: string, appId: string, deviceName: string) {
  const issued = await issueSessionPair(userId, appId, deviceName, createId());
  return {
    token: issued.token,
    refreshToken: issued.refreshToken,
    user: toPublicUser(await getUserRow(userId)),
  };
}

async function createWelcomeNotifications(userId: string) {
  const insert = database.prepare(`
    INSERT INTO notifications(id, user_id, type, title, body, route, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const createdAt = nowIso();
  await insert.run(
    createId(),
    userId,
    'system',
    `欢迎使用${SERVICE_NAME}`,
    '你的账号已创建，所有设置会安全同步。',
    'profile.home',
    createdAt,
  );
  await insert.run(
    createId(),
    userId,
    'membership',
    '探索 Pro 创作能力',
    '查看动态会员等级与当前可用方案。',
    'membership.home',
    createdAt,
  );
}
