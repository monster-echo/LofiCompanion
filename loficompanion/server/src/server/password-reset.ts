import { database, getRuntimeConfig, nowIso, runTransaction } from './database';
import { ApiError } from './http';
import { createId, createSessionToken, hashToken } from './ids';
import { hashPassword, validatePasswordAgainstPolicy } from './passwords';

const challengeMinutes = 10;
const tokenMinutes = 10;
const resendCooldownMs = 60_000;
const maximumAttempts = 5;

export async function requestPasswordReset(appId: string, rawEmail: string) {
  const email = rawEmail.trim().toLowerCase();
  const user = await database.prepare(
    'SELECT id FROM users WHERE app_id = ? AND email = ?',
  ).get(appId, email) as { id: string } | undefined;
  if (!user) return genericRequestResult();
  const latest = await database.prepare(`
    SELECT created_at FROM password_reset_challenges
    WHERE app_id = ? AND email = ? ORDER BY created_at DESC LIMIT 1
  `).get(appId, email) as { created_at: string } | undefined;
  if (latest && Date.now() - Date.parse(latest.created_at) < resendCooldownMs) {
    return genericRequestResult();
  }
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000)
    .padStart(6, '0');
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + challengeMinutes * 60_000).toISOString();
  await database.prepare(`
    INSERT INTO password_reset_challenges(
      id, app_id, user_id, email, code_hash, expires_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    createId(),
    appId,
    user.id,
    email,
    codeHash(appId, email, code),
    expiresAt,
    createdAt,
  );
  await deliverResetCode(appId, email, code);
  return genericRequestResult();
}

export async function verifyPasswordResetCode(appId: string, rawEmail: string, code: string) {
  const email = rawEmail.trim().toLowerCase();
  const challenge = await database.prepare(`
    SELECT * FROM password_reset_challenges
    WHERE app_id = ? AND email = ? AND used_at IS NULL
    ORDER BY created_at DESC LIMIT 1
  `).get(appId, email) as ChallengeRow | undefined;
  if (!challenge || challenge.expires_at <= nowIso()) {
    throw new ApiError(400, 'RESET_CODE_EXPIRED', '验证码无效或已过期');
  }
  if (challenge.attempts >= maximumAttempts) {
    throw new ApiError(429, 'RESET_CODE_LOCKED', '尝试次数过多，请重新获取验证码');
  }
  if (challenge.code_hash !== codeHash(appId, email, code)) {
    await database.prepare(
      'UPDATE password_reset_challenges SET attempts = attempts + 1 WHERE id = ?',
    ).run(challenge.id);
    throw new ApiError(400, 'RESET_CODE_INVALID', '验证码无效或已过期');
  }
  const token = createSessionToken();
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + tokenMinutes * 60_000).toISOString();
  await runTransaction(async () => {
    await database.prepare(
      'UPDATE password_reset_challenges SET used_at = ? WHERE id = ?',
    ).run(createdAt, challenge.id);
    await database.prepare(`
      INSERT INTO password_reset_tokens(
        id, app_id, user_id, token_hash, expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(createId(), appId, challenge.user_id, hashToken(token), expiresAt, createdAt);
  });
  return { resetToken: token, expiresInSeconds: tokenMinutes * 60 };
}

export async function resetPassword(appId: string, resetToken: string, password: string) {
  const config = await getRuntimeConfig(appId);
  const reasons = validatePasswordAgainstPolicy(
    config.auth.passwordPolicy,
    password,
  );
  if (reasons.length) {
    throw new ApiError(400, 'VALIDATION_ERROR', '密码不符合要求', false, {
      newPassword: reasons,
    });
  }
  const token = await database.prepare(`
    SELECT * FROM password_reset_tokens
    WHERE app_id = ? AND token_hash = ? AND used_at IS NULL AND expires_at > ?
  `).get(appId, hashToken(resetToken), nowIso()) as ResetTokenRow | undefined;
  if (!token) throw new ApiError(400, 'RESET_TOKEN_INVALID', '重置凭证无效或已过期');
  const passwordHash = await hashPassword(password);
  const timestamp = nowIso();
  await runTransaction(async () => {
    await database.prepare(
      'UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?',
    ).run(passwordHash, timestamp, token.user_id);
    await database.prepare(
      'UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL',
    ).run(timestamp, token.user_id);
    await database.prepare(
      'UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL',
    ).run(timestamp, token.user_id);
    await database.prepare(
      'UPDATE password_reset_tokens SET used_at = ? WHERE id = ?',
    ).run(timestamp, token.id);
  });
  return { changed: true, requiresSignIn: true };
}

async function deliverResetCode(appId: string, email: string, code: string) {
  const messageId = createId();
  const payload = JSON.stringify({ code, expiresInMinutes: challengeMinutes });
  await database.prepare(`
    INSERT INTO outbound_messages(
      id, app_id, channel, recipient, template, payload, status, created_at
    ) VALUES (?, ?, 'email', ?, 'password_reset_code', ?, 'pending', ?)
  `).run(messageId, appId, email, payload, nowIso());
  const endpoint = process.env.MOBILEUI_EMAIL_ENDPOINT;
  if (!endpoint) return;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.MOBILEUI_EMAIL_API_KEY ?? ''}`,
      },
      body: JSON.stringify({ appId, to: email, template: 'password_reset_code', code }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    await database.prepare(`
      UPDATE outbound_messages SET status = 'sent', sent_at = ? WHERE id = ?
    `).run(nowIso(), messageId);
  } catch {
    await database.prepare(`
      UPDATE outbound_messages SET status = 'failed', error_code = 'DELIVERY_FAILED'
      WHERE id = ?
    `).run(messageId);
  }
}

function genericRequestResult() {
  return { accepted: true, resendAfterSeconds: 60 };
}

function codeHash(appId: string, email: string, code: string) {
  const pepper = process.env.MOBILEUI_RESET_PEPPER ?? 'local-development-reset-pepper';
  return hashToken(`${pepper}:${appId}:${email}:${code}`);
}

type ChallengeRow = {
  id: string;
  user_id: string;
  code_hash: string;
  attempts: number;
  expires_at: string;
};

type ResetTokenRow = {
  id: string;
  user_id: string;
};
