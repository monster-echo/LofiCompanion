import type { NextRequest } from 'next/server';
import type { AdminProfile } from '@/lib/api-types';
import type { PasswordPolicy } from '@/domain/config';
import { database, nowIso } from './database';
import { createId, createSessionToken, hashToken } from './ids';
import { hashPassword, validatePasswordAgainstPolicy, verifyPassword } from './passwords';
import { ApiError } from './http';

export type { AdminProfile };

export type AdminSession = Readonly<{ admin: AdminProfile; appId: string }>;

export const ADMIN_SESSION_TTL_MS = 7 * 86400_000;
export const ADMIN_COOKIE = 'ms_admin_session';

const ADMIN_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 8,
  maxLength: 128,
  requireUppercase: false,
  requireLowercase: true,
  requireDigit: true,
  requireSymbol: false,
};

type AdminUser = AdminProfile & Readonly<{ passwordHash: string }>;

export async function adminExists(): Promise<boolean> {
  return Boolean(await database.prepare('SELECT 1 FROM admin_users LIMIT 1').get());
}

export async function createAdmin(input: Readonly<{
  username: string;
  email: string;
  password: string;
}>): Promise<AdminProfile> {
  const username = input.username.trim();
  const email = input.email.trim().toLowerCase();
  if (await database.prepare('SELECT 1 FROM admin_users WHERE username = ?').get(username)) {
    throw new ApiError(409, 'USERNAME_TAKEN', '用户名已被占用');
  }
  if (await database.prepare('SELECT 1 FROM admin_users WHERE email = ?').get(email)) {
    throw new ApiError(409, 'EMAIL_TAKEN', '邮箱已被占用');
  }
  const reasons = validatePasswordAgainstPolicy(ADMIN_PASSWORD_POLICY, input.password);
  if (reasons.length) {
    throw new ApiError(400, 'PASSWORD_POLICY', passwordMessage(reasons));
  }
  const id = createId();
  const createdAt = nowIso();
  const passwordHash = await hashPassword(input.password);
  await database.prepare(`
    INSERT INTO admin_users(id, username, email, password_hash, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, username, email, passwordHash, createdAt, createdAt);
  return { id, username, email, createdAt };
}

export async function verifyAdminCredentials(
  identifier: string,
  password: string,
): Promise<AdminProfile | null> {
  const admin = await findAdminByIdentifier(identifier);
  if (!admin) return null;
  const valid = await verifyPassword(admin.passwordHash, password);
  return valid ? toProfile(admin) : null;
}

export async function createSession(
  adminId: string,
  appId: string,
): Promise<{ token: string; expiresAt: string }> {
  const token = createSessionToken();
  const id = createId();
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_TTL_MS).toISOString();
  await database.prepare(`
    INSERT INTO admin_sessions(id, admin_id, token_hash, app_id, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, adminId, hashToken(token), appId, createdAt, expiresAt);
  return { token, expiresAt };
}

export async function getAdminByToken(token: string): Promise<AdminSession | null> {
  const row = await database.prepare(`
    SELECT u.id AS id, u.username AS username, u.email AS email,
      u.created_at AS createdAt, s.app_id AS appId
    FROM admin_users u JOIN admin_sessions s ON s.admin_id = u.id
    WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?
  `).get(hashToken(token), nowIso()) as {
    id: string; username: string; email: string; createdAt: string; appId: string;
  } | undefined;
  // Rebuild as plain objects at the repository boundary. An empty app_id means
  // a pre-app-binding session — treat it as unauthenticated so the admin re-logs in.
  if (!row || !row.appId) return null;
  return {
    admin: { id: row.id, username: row.username, email: row.email, createdAt: row.createdAt },
    appId: row.appId,
  };
}

export async function revokeSession(token: string): Promise<void> {
  await database.prepare(
    'UPDATE admin_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL',
  ).run(nowIso(), hashToken(token));
}

export async function getAdminFromRequest(
  request: NextRequest,
): Promise<AdminSession | null> {
  const token = request.cookies.get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  return await getAdminByToken(token);
}

async function findAdminByIdentifier(identifier: string): Promise<AdminUser | null> {
  const value = identifier.trim();
  const row = await database.prepare(`
    SELECT id, username, email, password_hash AS passwordHash, created_at AS createdAt
    FROM admin_users WHERE username = ? OR email = ?
  `).get(value, value.toLowerCase()) as AdminUser | undefined;
  return row ?? null;
}

function toProfile(admin: AdminUser): AdminProfile {
  return { id: admin.id, username: admin.username, email: admin.email, createdAt: admin.createdAt };
}

function passwordMessage(reasons: readonly string[]) {
  const map: Readonly<Record<string, string>> = {
    PASSWORD_TOO_SHORT: '密码至少 8 位',
    PASSWORD_TOO_LONG: '密码过长',
    PASSWORD_MISSING_UPPERCASE: '需包含大写字母',
    PASSWORD_MISSING_LOWERCASE: '需包含小写字母',
    PASSWORD_MISSING_DIGIT: '需包含数字',
    PASSWORD_MISSING_SYMBOL: '需包含特殊符号',
  };
  return reasons.map((reason) => map[reason] ?? reason).join('；');
}
