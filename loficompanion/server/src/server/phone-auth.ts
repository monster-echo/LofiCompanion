import { createHmac, randomUUID } from 'node:crypto';
import { database, nowIso, runTransaction } from './database';
import { createUserSession } from './auth';
import { ApiError } from './http';
import { createId, hashToken } from './ids';

const challengeMinutes = 10;
const resendCooldownMs = 60_000;
const maximumAttempts = 5;

export async function requestPhoneCode(appId: string, phone: string) {
  const latest = await database.prepare(`
    SELECT created_at FROM phone_auth_challenges
    WHERE app_id = ? AND phone = ? ORDER BY created_at DESC LIMIT 1
  `).get(appId, phone) as { created_at: string } | undefined;
  if (latest && Date.now() - Date.parse(latest.created_at) < resendCooldownMs) {
    return requestResult();
  }
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000)
    .padStart(6, '0');
  await database.prepare(`
    INSERT INTO phone_auth_challenges(
      id, app_id, phone, code_hash, expires_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    createId(),
    appId,
    phone,
    codeHash(appId, phone, code),
    new Date(Date.now() + challengeMinutes * 60_000).toISOString(),
    nowIso(),
  );
  await deliverPhoneCode(appId, phone, code);
  return requestResult();
}

export async function verifyPhoneCode(
  appId: string,
  phone: string,
  code: string,
  deviceName: string,
) {
  const challenge = await database.prepare(`
    SELECT * FROM phone_auth_challenges
    WHERE app_id = ? AND phone = ? AND used_at IS NULL
    ORDER BY created_at DESC LIMIT 1
  `).get(appId, phone) as ChallengeRow | undefined;
  if (!challenge || challenge.expires_at <= nowIso()) {
    throw new ApiError(400, 'PHONE_CODE_EXPIRED', '验证码无效或已过期');
  }
  if (challenge.attempts >= maximumAttempts) {
    throw new ApiError(429, 'PHONE_CODE_LOCKED', '尝试次数过多，请重新获取验证码');
  }
  if (challenge.code_hash !== codeHash(appId, phone, code)) {
    await database.prepare(
      'UPDATE phone_auth_challenges SET attempts = attempts + 1 WHERE id = ?',
    ).run(challenge.id);
    throw new ApiError(400, 'PHONE_CODE_INVALID', '验证码无效或已过期');
  }
  const userId = await findOrCreatePhoneUser(appId, phone);
  await runTransaction(async () => {
    await database.prepare(
      'UPDATE phone_auth_challenges SET used_at = ? WHERE id = ?',
    ).run(nowIso(), challenge.id);
  });
  return await createUserSession(userId, appId, deviceName);
}

async function findOrCreatePhoneUser(appId: string, phone: string) {
  const subject = `${appId}:${phone}`;
  const identity = await database.prepare(`
    SELECT user_id FROM external_identities
    WHERE provider = 'phone' AND provider_subject = ?
  `).get(subject) as { user_id: string } | undefined;
  if (identity) return identity.user_id;
  const userId = createId();
  const createdAt = nowIso();
  // 无真实邮箱 → NULL（不再生成 xxx@phone.invalid 伪邮箱，issue #14）。
  await database.prepare(`
    INSERT INTO users(
      id, app_id, email, password_hash, username, created_at, updated_at
    ) VALUES (?, ?, NULL, ?, ?, ?, ?)
  `).run(
    userId,
    appId,
    `external$${createId()}`,
    `手机用户${phone.slice(-4)}`,
    createdAt,
    createdAt,
  );
  await database.prepare(`
    INSERT INTO external_identities(
      id, user_id, provider, provider_subject, created_at
    ) VALUES (?, ?, 'phone', ?, ?)
  `).run(createId(), userId, subject, createdAt);
  return userId;
}

/** 阿里云 RPC 签名（percentEncode），Node 自带 crypto 实现，无额外依赖。 */
function percentEncode(s: string): string {
  return encodeURIComponent(s)
    .replace(/\+/g, '%20')
    .replace(/\*/g, '%2A')
    .replace(/%7E/g, '~');
}

/** 直接用阿里云短信（dysmsapi）发送验证码。 */
async function sendSmsAliyun(phone: string, code: string): Promise<void> {
  const accessKeyId = process.env.MOBILEUI_ALIYUN_ACCESS_KEY_ID;
  const accessKeySecret = process.env.MOBILEUI_ALIYUN_ACCESS_KEY_SECRET;
  const signName = process.env.MOBILEUI_ALIYUN_SIGN_NAME;
  const templateCode = process.env.MOBILEUI_ALIYUN_TEMPLATE_CODE;
  if (!accessKeyId || !accessKeySecret || !signName || !templateCode) {
    throw new Error('aliyun_sms_not_configured');
  }
  const params: Record<string, string> = {
    Action: 'SendSms',
    Version: '2017-05-25',
    RegionId: process.env.MOBILEUI_ALIYUN_REGION ?? 'cn-hangzhou',
    PhoneNumbers: phone.replace(/^\+86/, ''),
    SignName: signName,
    TemplateCode: templateCode,
    TemplateParam: JSON.stringify({ code, time: '5' }),
    AccessKeyId: accessKeyId,
    Format: 'JSON',
    SignatureMethod: 'HMAC-SHA1',
    SignatureVersion: '1.0',
    SignatureNonce: randomUUID(),
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  };
  const canonical = Object.keys(params).sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(params[k]!)}`)
    .join('&');
  const stringToSign = `POST&%2F&${percentEncode(canonical)}`;
  const signature = createHmac('sha1', `${accessKeySecret}&`).update(stringToSign).digest('base64');
  params.Signature = signature;
  const url = `https://dysmsapi.aliyuncs.com/?${Object.keys(params)
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k]!)}`)
    .join('&')}`;
  const response = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(8000) });
  const body = await response.json() as { Code?: string; Message?: string };
  if (!response.ok || body.Code !== 'OK') {
    throw new Error(`aliyun_sms_${body.Code ?? 'HTTP_' + response.status} ${body.Message ?? ''}`.trim());
  }
}

async function deliverPhoneCode(appId: string, phone: string, code: string) {
  const messageId = createId();
  const payload = JSON.stringify({ code, expiresInMinutes: challengeMinutes });
  await database.prepare(`
    INSERT INTO outbound_messages(
      id, app_id, channel, recipient, template, payload, status, created_at
    ) VALUES (?, ?, 'sms', ?, 'phone_login_code', ?, 'pending', ?)
  `).run(messageId, appId, phone, payload, nowIso());
  try {
    // 优先：auth 内直接阿里云短信。未配置则回退到自建网关 endpoint（MOBILEUI_SMS_ENDPOINT）。
    if (process.env.MOBILEUI_ALIYUN_ACCESS_KEY_ID) {
      await sendSmsAliyun(phone, code);
    } else {
      const endpoint = process.env.MOBILEUI_SMS_ENDPOINT;
      if (!endpoint) return;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${process.env.MOBILEUI_SMS_API_KEY ?? ''}`,
        },
        body: JSON.stringify({ appId, to: phone, template: 'phone_login_code', code }),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
    }
    await database.prepare(
      'UPDATE outbound_messages SET status = ?, sent_at = ? WHERE id = ?',
    ).run('sent', nowIso(), messageId);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'DELIVERY_FAILED';
    await database.prepare(`
      UPDATE outbound_messages SET status = ?, error_code = ? WHERE id = ?
    `).run('failed', reason.slice(0, 100), messageId);
  }
}

function requestResult() {
  return { accepted: true, resendAfterSeconds: 60 };
}

function codeHash(appId: string, phone: string, code: string) {
  const pepper = process.env.MOBILEUI_PHONE_PEPPER ?? 'local-development-phone-pepper';
  return hashToken(`${pepper}:${appId}:${phone}:${code}`);
}

type ChallengeRow = {
  id: string;
  code_hash: string;
  attempts: number;
  expires_at: string;
};
