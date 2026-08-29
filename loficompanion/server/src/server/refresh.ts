import { database, nowIso, runTransaction } from './database';
import { ApiError } from './http';
import { createId, createSessionToken, hashToken } from './ids';
import { signAccessToken } from './jwt';
import { ACCESS_TOKEN_TTL_MS, REFRESH_TOKEN_TTL_MS, revokeRefreshFamily } from './session-tokens';
import { getUserRow, toPublicUser } from './auth';

type RefreshRow = {
  id: string;
  user_id: string;
  session_id: string;
  family_id: string;
  expires_at: string;
  revoked_at: string | null;
};

export async function rotateRefreshToken(appId: string, rawRefreshToken: string) {
  const row = await database.prepare(
    'SELECT * FROM refresh_tokens WHERE token_hash = ?',
  ).get(hashToken(rawRefreshToken)) as RefreshRow | undefined;
  if (!row) throw new ApiError(401, 'REFRESH_TOKEN_INVALID', '登录状态已过期');
  if (row.revoked_at) {
    await revokeRefreshFamily(row.family_id);
    throw new ApiError(401, 'REFRESH_TOKEN_REUSED', '登录状态异常，请重新登录');
  }
  if (row.expires_at <= nowIso()) {
    throw new ApiError(401, 'REFRESH_TOKEN_EXPIRED', '登录状态已过期');
  }
  const user = await getUserRow(row.user_id);
  if (user.app_id !== appId) {
    throw new ApiError(401, 'TENANT_MISMATCH', '登录状态不属于当前应用');
  }
  const newAccess = await signAccessToken({
    userId: row.user_id,
    appId,
    sessionId: row.session_id,
    ttlMs: ACCESS_TOKEN_TTL_MS,
  });
  const newRefresh = createSessionToken();
  const newRefreshId = createId();
  const now = nowIso();
  const accessExpires = new Date(Date.now() + ACCESS_TOKEN_TTL_MS).toISOString();
  const refreshExpires = new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString();
  await runTransaction(async () => {
    await database.prepare(
      'UPDATE refresh_tokens SET revoked_at = ?, replaced_by = ? WHERE id = ?',
    ).run(now, newRefreshId, row.id);
    await database.prepare(`
      INSERT INTO refresh_tokens(
        id, app_id, user_id, session_id, family_id, token_hash, expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newRefreshId,
      appId,
      row.user_id,
      row.session_id,
      row.family_id,
      hashToken(newRefresh),
      refreshExpires,
      now,
    );
    await database.prepare(
      'UPDATE sessions SET token_hash = ?, expires_at = ?, last_seen_at = ? WHERE id = ?',
    ).run(hashToken(newAccess), accessExpires, now, row.session_id);
  });
  return { token: newAccess, refreshToken: newRefresh, user: toPublicUser(user) };
}
