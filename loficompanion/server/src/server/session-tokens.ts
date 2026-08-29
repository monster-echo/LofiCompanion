import { database, nowIso, runTransaction } from './database';
import { createId, createSessionToken, hashToken } from './ids';
import { signAccessToken } from './jwt';

export const ACCESS_TOKEN_TTL_MS = 30 * 60_000;
export const REFRESH_TOKEN_TTL_MS = 30 * 86400_000;

export type IssuedTokens = Readonly<{
  token: string;
  refreshToken: string;
  sessionId: string;
}>;

export async function issueSessionPair(
  userId: string,
  appId: string,
  deviceName: string,
  familyId: string,
): Promise<IssuedTokens> {
  const sessionId = createId();
  const token = await signAccessToken({ userId, appId, sessionId, ttlMs: ACCESS_TOKEN_TTL_MS });
  const refreshToken = createSessionToken();
  const refreshId = createId();
  const createdAt = nowIso();
  const sessionExpires = new Date(Date.now() + ACCESS_TOKEN_TTL_MS).toISOString();
  const refreshExpires = new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString();
  await runTransaction(async () => {
    await database.prepare(`
      INSERT INTO sessions(
        id, user_id, token_hash, device_name, created_at, last_seen_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      sessionId,
      userId,
      hashToken(token),
      deviceName || 'Unknown device',
      createdAt,
      createdAt,
      sessionExpires,
    );
    await database.prepare(`
      INSERT INTO refresh_tokens(
        id, app_id, user_id, session_id, family_id, token_hash, expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(refreshId, appId, userId, sessionId, familyId, hashToken(refreshToken), refreshExpires, createdAt);
  });
  return { token, refreshToken, sessionId };
}

export async function revokeRefreshForSession(sessionId: string) {
  await database.prepare(
    'UPDATE refresh_tokens SET revoked_at = ? WHERE session_id = ? AND revoked_at IS NULL',
  ).run(nowIso(), sessionId);
}

export async function revokeAllRefreshForUser(userId: string) {
  await database.prepare(
    'UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL',
  ).run(nowIso(), userId);
}

export async function revokeRefreshFamily(familyId: string) {
  const now = nowIso();
  await runTransaction(async () => {
    await database.prepare(
      'UPDATE refresh_tokens SET revoked_at = ? WHERE family_id = ? AND revoked_at IS NULL',
    ).run(now, familyId);
    await database.prepare(`
      UPDATE sessions SET revoked_at = ?
      WHERE id IN (SELECT session_id FROM refresh_tokens WHERE family_id = ?)
        AND revoked_at IS NULL
    `).run(now, familyId);
  });
}
