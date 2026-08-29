import { importPKCS8, SignJWT } from 'jose';

export type PushMessage = Readonly<{
  token: string;
  title: string;
  body: string;
  route: string | null;
}>;

export type PushResult = Readonly<{
  delivered: boolean;
  permanent: boolean;
  messageId?: string;
  errorCode?: string;
}>;

type FcmCredentials = Readonly<{
  projectId: string;
  clientEmail: string;
  privateKey: string;
}>;

type CachedToken = { value: string; expiresAt: number };
const tokenCache = new Map<string, CachedToken>();

export async function sendPush(
  appId: string,
  environment: string,
  provider: string,
  message: PushMessage,
): Promise<PushResult> {
  if (provider === 'local') {
    return { delivered: true, permanent: false, messageId: `local:${Date.now()}` };
  }
  if (provider !== 'fcm') {
    return { delivered: false, permanent: true, errorCode: 'PROVIDER_NOT_CONFIGURED' };
  }
  const credentials = credentialsFor(appId, environment);
  if (!credentials) {
    return { delivered: false, permanent: false, errorCode: 'FCM_NOT_CONFIGURED' };
  }
  return sendFcm(credentials, message);
}

async function sendFcm(credentials: FcmCredentials, message: PushMessage) {
  const accessToken = await getAccessToken(credentials);
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${credentials.projectId}/messages:send`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token: message.token,
          notification: { title: message.title, body: message.body },
          data: message.route ? { route: message.route } : {},
        },
      }),
      signal: AbortSignal.timeout(8000),
    },
  );
  const body = await response.json() as {
    name?: string;
    error?: { status?: string; details?: Array<{ errorCode?: string }> };
  };
  if (response.ok && body.name) {
    return { delivered: true, permanent: false, messageId: body.name };
  }
  const code = body.error?.details?.find((detail) => detail.errorCode)?.errorCode
    ?? body.error?.status ?? 'FCM_REJECTED';
  return {
    delivered: false,
    permanent: code === 'UNREGISTERED' || code === 'INVALID_ARGUMENT',
    errorCode: code,
  };
}

async function getAccessToken(credentials: FcmCredentials) {
  const cached = tokenCache.get(credentials.clientEmail);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.value;
  const now = Math.floor(Date.now() / 1000);
  const key = await importPKCS8(credentials.privateKey.replace(/\\n/g, '\n'), 'RS256');
  const assertion = await new SignJWT({
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(credentials.clientEmail)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    signal: AbortSignal.timeout(8000),
  });
  const body = await response.json() as { access_token?: string; expires_in?: number };
  if (!response.ok || !body.access_token) throw new Error('FCM_AUTH_FAILED');
  tokenCache.set(credentials.clientEmail, {
    value: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  });
  return body.access_token;
}

function credentialsFor(appId: string, environment: string): FcmCredentials | null {
  const raw = process.env.MOBILEUI_FCM_TENANTS_JSON;
  if (!raw) return null;
  const values = JSON.parse(raw) as Record<string, FcmCredentials>;
  return values[`${appId}:${environment}`] ?? null;
}
