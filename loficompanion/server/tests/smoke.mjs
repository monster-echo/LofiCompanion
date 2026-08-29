// Live HTTP smoke trace for the account-security flow. Run against a freshly
// started server (e.g. `next start --port 3310`). Not part of `npm test`.
import pg from 'pg';

const BASE = process.env.SMOKE_BASE ?? 'http://127.0.0.1:3310';
const H = { 'content-type': 'application/json', 'x-app-id': 'zhongbei', 'x-app-environment': 'development' };
const stamp = Date.now();
const email = `smoke-${stamp}@test.local`;
let pass = 0;
const fail = [];
function check(name, cond) {
  if (cond) { pass += 1; console.log(`  ✔ ${name}`); }
  else { fail.push(name); console.log(`  ✖ ${name}`); }
}
async function req(path, body) {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

console.log('1. passwordPolicy published in bootstrap');
const boot = await (await fetch(`${BASE}/api/v1/bootstrap`, { headers: { 'x-app-id': 'zhongbei' } })).json();
check('config.auth.passwordPolicy present', !!boot?.data?.config?.auth?.passwordPolicy?.minLength);

console.log('2. sign-up WITHOUT consent rejected (400 VALIDATION_ERROR)');
const noConsent = await req('/api/v1/auth/sign-up', { email, password: 'Test1234', username: 'smoke1' });
check('400 + consentVersion field error', noConsent.status === 400 && !!noConsent.json?.error?.fieldErrors?.consentVersion);

console.log('3. sign-up WITH consent succeeds (201, tokens, unverified)');
const signUp = await req('/api/v1/auth/sign-up', { email, password: 'Test1234', username: 'smoke1', consentVersion: '2026-07-29' });
check('201', signUp.status === 201);
check('returns accessToken', !!signUp.json?.data?.token);
check('returns refreshToken', !!signUp.json?.data?.refreshToken);
check('emailVerified false', signUp.json?.data?.user?.emailVerified === false);
check('consentVersion recorded', signUp.json?.data?.user?.consentVersion === '2026-07-29');
const refreshToken = signUp.json?.data?.refreshToken;

console.log('4. email verification via code read from DB');
const pool = new pg.Pool({
  connectionString: process.env.MOBILEUI_DATABASE_URL ?? process.env.DATABASE_URL,
});
const result = await pool.query(
  "SELECT payload FROM outbound_messages WHERE template='email_verification_code' AND recipient=$1 ORDER BY created_at DESC LIMIT 1",
  [email],
);
const row = result.rows[0];
const code = row ? JSON.parse(row.payload).code : null;
check('verification code delivered to outbound_messages', !!code);
const verify = await req('/api/v1/auth/verify-email', { email, code });
check('verified', verify.status === 200 && verify.json?.data?.verified === true);
const reuse = await req('/api/v1/auth/verify-email', { email, code });
check('reuse rejected (400)', reuse.status === 400);

console.log('5. sign-in returns tokens');
const signIn = await req('/api/v1/auth/sign-in', { identifier: email, password: 'Test1234', deviceName: 'smoke' });
check('200 + token', signIn.status === 200 && !!signIn.json?.data?.token);

console.log('6. refresh rotates; reuse revokes family');
const rotated = await req('/api/v1/auth/refresh', { refreshToken });
check('refresh 200 + new tokens', rotated.status === 200 && rotated.json?.data?.refreshToken && rotated.json?.data?.refreshToken !== refreshToken);
const reuseRefresh = await req('/api/v1/auth/refresh', { refreshToken });
check('reused refresh -> REFRESH_TOKEN_REUSED', reuseRefresh.status === 401 && reuseRefresh.json?.error?.code === 'REFRESH_TOKEN_REUSED');
const reuseRotated = await req('/api/v1/auth/refresh', { refreshToken: rotated.json.data.refreshToken });
check('rotated token also dead after family revoke', reuseRotated.status === 401);

console.log('7. sign-in lockout after repeated failures');
const lockEmail = `lock-${stamp}@test.local`;
await req('/api/v1/auth/sign-up', { email: lockEmail, password: 'Test1234', username: `lock-${stamp}`, consentVersion: '2026-07-29' });
for (let i = 0; i < 5; i += 1) await req('/api/v1/auth/sign-in', { identifier: lockEmail, password: 'Wrong-Pass-1', deviceName: 'smoke' });
const locked = await req('/api/v1/auth/sign-in', { identifier: lockEmail, password: 'Test1234', deviceName: 'smoke' });
check('locked -> SIGN_IN_LOCKED with retryAfterSeconds', locked.status === 429 && locked.json?.error?.code === 'SIGN_IN_LOCKED' && !!locked.json?.error?.retryAfterSeconds);

console.log('8. public legal API (no auth)');
const publicLegal = await fetch(`${BASE}/api/v1/public/legal?app=zhongbei&type=privacy`);
check('public legal 200 + has docs', publicLegal.status === 200);
const legalBody = await publicLegal.json();
check('doc title contains 隐私', legalBody?.data?.docs?.[0]?.title?.includes('隐私'));
const legalNoApp = await fetch(`${BASE}/api/v1/public/legal?type=privacy`);
check('missing app -> 400 VALIDATION_ERROR', legalNoApp.status === 400);

console.log('9. public legal page (HTML for App Store)');
const legalPage = await fetch(`${BASE}/legal/privacy?app=zhongbei`);
check('page 200', legalPage.status === 200);
check('page contains 隐私', (await legalPage.text()).includes('隐私'));

console.log('10. GDPR data export (/api/v1/me/export)');
const exH = { authorization: `Bearer ${signIn.json.data.token}`, 'x-app-id': 'zhongbei' };
const exportRes = await fetch(`${BASE}/api/v1/me/export`, { headers: exH });
check('export 200', exportRes.status === 200);
const ex = await exportRes.json();
check('export has profile.email', !!ex?.data?.profile?.email);
check('export has sessions[]', Array.isArray(ex?.data?.sessions));
check('export has telemetry[]', Array.isArray(ex?.data?.telemetry));
const exportNoAuth = await fetch(`${BASE}/api/v1/me/export`, { headers: { 'x-app-id': 'zhongbei' } });
check('unauth export -> 401', exportNoAuth.status === 401);

console.log('11. admin login requires app binding');
const loginNoApp = await fetch(`${BASE}/api/v1/admin/auth/login`, {
  method: 'POST', headers: H, body: JSON.stringify({ identifier: 'admin', password: 'admin123' }),
});
check('missing appId -> 400', loginNoApp.status === 400);
const loginWrongApp = await fetch(`${BASE}/api/v1/admin/auth/login`, {
  method: 'POST', headers: H, body: JSON.stringify({ identifier: 'admin', password: 'admin123', appId: 'no-such-app' }),
});
check('wrong appId -> 404 APP_NOT_FOUND', loginWrongApp.status === 404
  && (await loginWrongApp.json())?.error?.code === 'APP_NOT_FOUND');
const loginGood = await fetch(`${BASE}/api/v1/admin/auth/login`, {
  method: 'POST', headers: H, body: JSON.stringify({ identifier: 'admin', password: 'admin123', appId: 'zhongbei' }),
});
// admin seed requires NODE_ENV !== 'production' (dev default) or env var
check('good appId (admin dev seed) -> 200', loginGood.status === 200);

console.log(`\n${pass} passed, ${fail.length} failed`);
await pool.end();
process.exit(fail.length ? 1 : 0);
