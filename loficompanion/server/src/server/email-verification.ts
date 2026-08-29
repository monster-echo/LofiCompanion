import { database, nowIso, runTransaction } from './database';
import { ApiError } from './http';
import { createId, hashToken } from './ids';

const codeMinutes = 10;
const resendCooldownMs = 60_000;
const maximumAttempts = 5;
const resendDayCap = 10;

export async function createEmailVerification(appId: string, userId: string, email: string) {
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000)
    .padStart(6, '0');
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + codeMinutes * 60_000).toISOString();
  await database.prepare(`
    INSERT INTO email_verifications(
      id, app_id, user_id, email, code_hash, expires_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(createId(), appId, userId, email, codeHash(appId, email, code), expiresAt, createdAt);
  await deliverVerificationCode(appId, email, code);
  return genericResult();
}

export async function requestEmailVerificationResend(appId: string, rawEmail: string) {
  const email = rawEmail.trim().toLowerCase();
  const user = await database.prepare(
    'SELECT id FROM users WHERE app_id = ? AND email = ?',
  ).get(appId, email) as { id: string } | undefined;
  if (!user) return genericResult();
  const latest = await database.prepare(`
    SELECT created_at FROM email_verifications
    WHERE app_id = ? AND email = ? ORDER BY created_at DESC LIMIT 1
  `).get(appId, email) as { created_at: string } | undefined;
  if (latest && Date.now() - Date.parse(latest.created_at) < resendCooldownMs) {
    return genericResult();
  }
  const recentCount = await database.prepare(`
    SELECT COUNT(*) AS count FROM email_verifications
    WHERE app_id = ? AND email = ? AND created_at > ?
  `).get(appId, email, new Date(Date.now() - 86_400_000).toISOString()) as { count: number };
  if (recentCount.count >= resendDayCap) return genericResult();
  await createEmailVerification(appId, user.id, email);
  return genericResult();
}

export async function verifyEmail(appId: string, rawEmail: string, code: string) {
  const email = rawEmail.trim().toLowerCase();
  const challenge = await database.prepare(`
    SELECT * FROM email_verifications
    WHERE app_id = ? AND email = ? AND used_at IS NULL
    ORDER BY created_at DESC LIMIT 1
  `).get(appId, email) as ChallengeRow | undefined;
  if (!challenge || challenge.expires_at <= nowIso()) {
    throw new ApiError(400, 'EMAIL_CODE_EXPIRED', '验证码无效或已过期');
  }
  if (challenge.attempts >= maximumAttempts) {
    throw new ApiError(429, 'EMAIL_CODE_LOCKED', '尝试次数过多，请重新获取验证码');
  }
  if (challenge.code_hash !== codeHash(appId, email, code)) {
    await database.prepare(
      'UPDATE email_verifications SET attempts = attempts + 1 WHERE id = ?',
    ).run(challenge.id);
    throw new ApiError(400, 'EMAIL_CODE_INVALID', '验证码无效或已过期');
  }
  await runTransaction(async () => {
    await database.prepare(
      'UPDATE email_verifications SET used_at = ? WHERE id = ?',
    ).run(nowIso(), challenge.id);
    await database.prepare(
      'UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?',
    ).run(nowIso(), challenge.user_id);
  });
  return { verified: true };
}

async function deliverVerificationCode(appId: string, email: string, code: string) {
  const messageId = createId();
  const payload = JSON.stringify({ code, expiresInMinutes: codeMinutes });
  await database.prepare(`
    INSERT INTO outbound_messages(
      id, app_id, channel, recipient, template, payload, status, created_at
    ) VALUES (?, ?, 'email', ?, 'email_verification_code', ?, 'pending', ?)
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
      body: JSON.stringify({ appId, to: email, template: 'email_verification_code', code }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    await database.prepare(
      'UPDATE outbound_messages SET status = ?, sent_at = ? WHERE id = ?',
    ).run('sent', nowIso(), messageId);
  } catch {
    await database.prepare(
      'UPDATE outbound_messages SET status = ?, error_code = ? WHERE id = ?',
    ).run('failed', 'DELIVERY_FAILED', messageId);
  }
}

function genericResult() {
  return { accepted: true, resendAfterSeconds: 60 };
}

function codeHash(appId: string, email: string, code: string) {
  const pepper = process.env.MOBILEUI_VERIFY_PEPPER ?? 'local-development-verify-pepper';
  return hashToken(`${pepper}:${appId}:${email}:${code}`);
}

type ChallengeRow = {
  id: string;
  user_id: string;
  code_hash: string;
  attempts: number;
  expires_at: string;
};
