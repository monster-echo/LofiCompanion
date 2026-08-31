import assert from 'node:assert/strict';
import test, { after } from 'node:test';
const { signUp, signIn, revokeAllSessions } = await import('../src/server/auth.ts');
const { rotateRefreshToken } = await import('../src/server/refresh.ts');
const { verifyEmail, requestEmailVerificationResend } = await import('../src/server/email-verification.ts');
const {
  requestPasswordReset,
  resetPassword,
  verifyPasswordResetCode,
} = await import('../src/server/password-reset.ts');
const { validatePasswordAgainstPolicy } = await import('../src/server/passwords.ts');
const { signUpSchema, socialSignInSchema, runtimeConfigSchema } = await import('../src/server/schemas.ts');
const { hashToken } = await import('../src/server/ids.ts');
const { database, nowIso, getRuntimeConfig, saveRuntimeConfig } = await import('../src/server/database.ts');
const { defaultConfig } = await import('../src/domain/config.ts');
after(async () => database.close());

const APP = 'zhongbei';
const prefix = `auth-${process.pid}`;
const policy = defaultConfig.auth.passwordPolicy;
let counter = 0;
const nextEmail = () => `${prefix}-${counter++}@test.local`;

// 开发测试账号对齐模板约定（database.ts ensureAppTestAccount：
// test@test.local / Test1234 / username 'test'）。套件额外依赖手机号登录，
// 这里幂等补挂 phone external_identity 并确保密码与库内历史漂移无关；
// 同时清退其他占用 username 'test' 的历史行，保证 username 登录不歧义。
{
  const { hashPassword } = await import('../src/server/passwords.ts');
  const ts = nowIso();
  const account = await database.prepare(
    'SELECT id FROM users WHERE app_id = ? AND email = ?',
  ).get(APP, 'test@test.local') as { id: string } | undefined;
  if (!account) throw new Error('模板测试账号缺失：bootstrap 未播种 test@test.local');
  await database.prepare(
    'UPDATE users SET password_hash = ?, email_verified = 1, updated_at = ? WHERE id = ?',
  ).run(await hashPassword('Test1234'), ts, account.id);
  await database.prepare(
    "UPDATE users SET username = 'test_legacy_' || substr(id, 1, 6), updated_at = ? "
    + "WHERE app_id = ? AND username = 'test' AND email <> 'test@test.local'",
  ).run(ts, APP);
  const phone = await database.prepare(
    "SELECT user_id FROM external_identities WHERE provider = 'phone' AND provider_subject = ?",
  ).get(`${APP}:+8613800000000`) as { user_id: string } | undefined;
  if (!phone) {
    await database.prepare(
      "INSERT INTO external_identities(id, user_id, provider, provider_subject, created_at) VALUES (?, ?, 'phone', ?, ?)",
    ).run(`dev-test-phone-${process.pid}`, account.id, `${APP}:+8613800000000`, ts);
  } else if (phone.user_id !== account.id) {
    // 历史运行可能把手机号身份挂到了别的行——重指向当前账号。
    await database.prepare(
      "UPDATE external_identities SET user_id = ? WHERE provider = 'phone' AND provider_subject = ?",
    ).run(account.id, `${APP}:+8613800000000`);
  }
}

async function latestVerificationCode(email: string): Promise<string | undefined> {
  const row = await database.prepare(
    "SELECT payload FROM outbound_messages WHERE template = 'email_verification_code' AND recipient = ? ORDER BY created_at DESC LIMIT 1",
  ).get(email) as { payload: string } | undefined;
  return row ? (JSON.parse(row.payload).code as string) : undefined;
}

async function latestResetCode(email: string): Promise<string | undefined> {
  const row = await database.prepare(
    "SELECT payload FROM outbound_messages WHERE template = 'password_reset_code' AND recipient = ? ORDER BY created_at DESC LIMIT 1",
  ).get(email) as { payload: string } | undefined;
  return row ? (JSON.parse(row.payload).code as string) : undefined;
}

async function userRow(email: string) {
  return await database.prepare(
    'SELECT email_verified, consent_version FROM users WHERE app_id = ? AND email = ?',
  ).get(APP, email) as { email_verified: number; consent_version: string | null };
}

test('sign-up schema requires consent version and a minimum password length', () => {
  assert.equal(signUpSchema.safeParse({
    email: nextEmail(), password: 'Test1234', username: 'noconsent',
  }).success, false);
  assert.equal(signUpSchema.safeParse({
    email: nextEmail(), password: 'short', username: 'weakpw', consentVersion: '2026-07-29',
  }).success, false);
});

test('测试账号播种开关：生产永不播种，非生产默认开、MOBILEUI_SEED_TEST_ACCOUNT=0 显式关', async () => {
  const { shouldSeedTestAccount } = await import('../src/server/database.ts');
  assert.equal(shouldSeedTestAccount('production', undefined), false);
  assert.equal(shouldSeedTestAccount('production', '1'), false);
  assert.equal(shouldSeedTestAccount('development', undefined), true);
  assert.equal(shouldSeedTestAccount(undefined, undefined), true);
  assert.equal(shouldSeedTestAccount('development', '0'), false);
});

test('development test account signs in with email, username, or phone', async () => {
  for (const identifier of ['test@test.local', 'test', '+8613800000000']) {
    const result = await signIn({
      appId: APP,
      identifier,
      password: 'Test1234',
      deviceName: 'test-runner',
    });
    assert.equal(result.user.email, 'test@test.local');
  }
});

test('sign-up enforces the runtime password policy', async () => {
  await assert.rejects(
    signUp({
      appId: APP, email: nextEmail(), password: 'NoDigitHere', username: `u-${prefix}-${counter}`,
      consentVersion: '2026-07-29', deviceName: 'test-runner',
    }),
    (error: { code: string }) => error.code === 'VALIDATION_ERROR',
  );
});

test('sign-up persists consent, leaves email unverified, and issues a verification code', async () => {
  const email = nextEmail();
  const result = await signUp({
    appId: APP, email, password: 'Test1234', username: `u-${prefix}-${counter}`,
    consentVersion: '2026-07-29', deviceName: 'test-runner',
  });
  assert.ok(result.token);
  assert.ok(result.refreshToken);
  assert.equal(result.user.emailVerified, false);
  assert.equal(result.user.consentVersion, '2026-07-29');
  assert.equal((await userRow(email)).consent_version, '2026-07-29');
  assert.equal((await userRow(email)).email_verified, 0);
  assert.ok(await latestVerificationCode(email));
});

test('same-version legacy config is upgraded with a password policy', async () => {
  const legacy = {
    ...defaultConfig,
    auth: { providers: defaultConfig.auth.providers },
  };
  await database.prepare(`
    UPDATE runtime_configs SET document = ?
    WHERE app_id = ? AND environment = 'development'
  `).run(JSON.stringify(legacy), APP);
  const upgraded = await getRuntimeConfig(APP);
  assert.deepEqual(upgraded.auth.passwordPolicy, defaultConfig.auth.passwordPolicy);
  await saveRuntimeConfig(defaultConfig, APP);
});

test('repeated failed sign-ins lock the account and clear after cooldown', async () => {
  const email = nextEmail();
  const password = 'Test1234';
  await signUp({
    appId: APP, email, password, username: `u-${prefix}-${counter}`,
    consentVersion: '2026-07-29', deviceName: 'test-runner',
  });
  for (let i = 0; i < 5; i += 1) {
    await assert.rejects(
      signIn({ appId: APP, identifier: email, password: 'Wrong-Pass-1', deviceName: 'test-runner' }),
      (error: { code: string }) => error.code === 'INVALID_CREDENTIALS',
    );
  }
  await assert.rejects(
    signIn({ appId: APP, identifier: email, password, deviceName: 'test-runner' }),
    (error: { code: string }) => error.code === 'SIGN_IN_LOCKED',
  );
  await database.prepare('UPDATE sign_in_attempts SET locked_until = ? WHERE app_id = ? AND identifier = ?')
    .run(new Date(Date.now() - 1000).toISOString(), APP, email);
  const recovered = await signIn({ appId: APP, identifier: email, password, deviceName: 'test-runner' });
  assert.ok(recovered.token);
});

test('refresh token rotates and the previous token is revoked', async () => {
  const email = nextEmail();
  const { refreshToken: first } = await signUp({
    appId: APP, email, password: 'Test1234', username: `u-${prefix}-${counter}`,
    consentVersion: '2026-07-29', deviceName: 'test-runner',
  });
  const rotated = await rotateRefreshToken(APP, first);
  assert.ok(rotated.token);
  assert.notEqual(rotated.refreshToken, first);
  const stale = await database.prepare(
    'SELECT revoked_at FROM refresh_tokens WHERE token_hash = ?',
  ).get(hashToken(first)) as { revoked_at: string | null };
  assert.ok(stale.revoked_at);
});

test('reusing a rotated refresh token revokes the whole family', async () => {
  const email = nextEmail();
  const { refreshToken: first } = await signUp({
    appId: APP, email, password: 'Test1234', username: `u-${prefix}-${counter}`,
    consentVersion: '2026-07-29', deviceName: 'test-runner',
  });
  const { refreshToken: second } = await rotateRefreshToken(APP, first);
  await assert.rejects(
    rotateRefreshToken(APP, first),
    (error: { code: string }) => error.code === 'REFRESH_TOKEN_REUSED',
  );
  await assert.rejects(
    rotateRefreshToken(APP, second),
    (error: { code: string }) => error.code === 'REFRESH_TOKEN_REUSED',
  );
});

test('sign-out-all invalidates refresh tokens', async () => {
  const email = nextEmail();
  const { refreshToken, user } = await signUp({
    appId: APP, email, password: 'Test1234', username: `u-${prefix}-${counter}`,
    consentVersion: '2026-07-29', deviceName: 'test-runner',
  });
  await revokeAllSessions(user.id);
  await assert.rejects(
    rotateRefreshToken(APP, refreshToken),
    (error: { code: string }) => error.code === 'REFRESH_TOKEN_REUSED',
  );
});

test('email verification rejects a wrong code, accepts the right one, and rejects reuse', async () => {
  const email = nextEmail();
  await signUp({
    appId: APP, email, password: 'Test1234', username: `u-${prefix}-${counter}`,
    consentVersion: '2026-07-29', deviceName: 'test-runner',
  });
  const code = (await latestVerificationCode(email))!;
  await assert.rejects(
    verifyEmail(APP, email, '000000'),
    (error: { code: string }) => error.code === 'EMAIL_CODE_INVALID',
  );
  assert.deepEqual(await verifyEmail(APP, email, code), { verified: true });
  assert.equal((await userRow(email)).email_verified, 1);
  await assert.rejects(
    verifyEmail(APP, email, code),
    (error: { code: string }) => error.code === 'EMAIL_CODE_EXPIRED',
  );
});

test('resend verification respects the cooldown window', async () => {
  const email = nextEmail();
  await signUp({
    appId: APP, email, password: 'Test1234', username: `u-${prefix}-${counter}`,
    consentVersion: '2026-07-29', deviceName: 'test-runner',
  });
  const before = await database.prepare(
    'SELECT COUNT(*) AS count FROM email_verifications WHERE app_id = ? AND email = ?',
  ).get(APP, email) as { count: number };
  await requestEmailVerificationResend(APP, email);
  const after = await database.prepare(
    'SELECT COUNT(*) AS count FROM email_verifications WHERE app_id = ? AND email = ?',
  ).get(APP, email) as { count: number };
  assert.equal(after.count, before.count);
});

test('password policy validation flags each missing requirement', () => {
  assert.ok(validatePasswordAgainstPolicy(policy, 'short').includes('PASSWORD_TOO_SHORT'));
  assert.ok(validatePasswordAgainstPolicy(policy, 'NoDigitsHere').includes('PASSWORD_MISSING_DIGIT'));
  assert.deepEqual(validatePasswordAgainstPolicy(policy, 'Test1234'), []);
});

test('password reset rejects weak passwords and accepts a policy-compliant password', async () => {
  const email = nextEmail();
  const originalPassword = 'Test1234';
  await signUp({
    appId: APP, email, password: originalPassword, username: `u-${prefix}-${counter}`,
    consentVersion: '2026-07-29', deviceName: 'test-runner',
  });
  await requestPasswordReset(APP, email);
  const code = (await latestResetCode(email))!;
  const { resetToken } = await verifyPasswordResetCode(APP, email, code);
  await assert.rejects(
    resetPassword(APP, resetToken, 'allletters'),
    (error: { code: string }) => error.code === 'VALIDATION_ERROR',
  );
  await resetPassword(APP, resetToken, 'Changed123');
  await assert.rejects(
    signIn({
      appId: APP, identifier: email, password: originalPassword, deviceName: 'test-runner',
    }),
    (error: { code: string }) => error.code === 'INVALID_CREDENTIALS',
  );
  const result = await signIn({
    appId: APP, identifier: email, password: 'Changed123', deviceName: 'test-runner',
  });
  assert.equal(result.user.email, email);
});

// ── Huawei one-tap login ────────────────────────────────────────────

test('socialSignInSchema accepts provider huawei with authorizationCode', () => {
  const parsed = socialSignInSchema.safeParse({
    provider: 'huawei', authorizationCode: 'abc123', deviceName: 'test',
  });
  assert.equal(parsed.success, true);
});

test('runtime config schema accepts a huawei auth provider', () => {
  // defaultConfig 已含 huawei provider；再叠加 per-app clientIds 验证 schema 接受
  const config = JSON.parse(JSON.stringify(defaultConfig));
  config.auth.providers = config.auth.providers.map((p: { id: string }) => (
    p.id === 'huawei'
      ? { ...p, enabled: true, platforms: ['harmonyos'], clientIds: { harmonyos: 'agc-client-id' } }
      : p
  ));
  const result = runtimeConfigSchema.safeParse(config);
  assert.equal(result.success, true);
});

test('huawei quick login exchanges auth code for phone and merges with phone account', async () => {
  const platform = 'harmonyos';
  const env = `hk-${process.pid}`;
  const cfg = JSON.parse(JSON.stringify(defaultConfig));
  cfg.auth.providers = cfg.auth.providers.map((p: { id: string }) => (
    { ...p, enabled: p.id === 'phone' || p.id === 'huawei' }
  ));
  await saveRuntimeConfig(cfg, APP, env);
  const config = await getRuntimeConfig(APP, env);
  const pid = String(process.pid);
  const phone = `+8613900${pid.padStart(4, '0')}`;
  // 独立的合并测试手机号（避免与上面新建测试的 phone identity 冲突）
  const mergePhone = `+8613800${pid.padStart(4, '0')}`;

  // 测试环境配置 HUAWEI_OAUTH_*（configuredProviders 校验需要）
  const savedClientId = process.env.HUAWEI_OAUTH_CLIENT_ID;
  const savedClientSecret = process.env.HUAWEI_OAUTH_CLIENT_SECRET;
  process.env.HUAWEI_OAUTH_CLIENT_ID = 'agc-test-client-id';
  process.env.HUAWEI_OAUTH_CLIENT_SECRET = 'agc-test-secret';

  // 打桩华为 getPhoneNumber：authCode-3 → mergePhone，其它 → phone
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('account-api.cloud.huawei.com')) {
      const body = JSON.parse(String(init?.body)) as { code: string };
      const hit = body.code === 'authcode-3' ? mergePhone : phone;
      return new Response(JSON.stringify({
        resultCode: 0,
        phoneNumber: hit,
        purePhoneNumber: hit.replace('+86', ''),
        phoneCountryCode: '86',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  try {
    const { socialSignIn } = await import('../src/server/social-auth.ts');
    const session = await socialSignIn(
      { appId: APP, provider: 'huawei', authorizationCode: 'authcode-1', deviceName: 'test' },
      config, platform,
    );
    // 华为登录（无真实邮箱）→ email 为 NULL（issue #14：不再伪邮箱）
    assert.equal(session.user.email, null);

    // 再次华为登录 → 同一用户
    const again = await socialSignIn(
      { appId: APP, provider: 'huawei', authorizationCode: 'authcode-2', deviceName: 'test' },
      config, platform,
    );
    assert.equal(again.user.id, session.user.id);

    // 已有 phone identity（mergePhone）→ 华为登录合并到同一账号
    const mergeSubject = `${APP}:${mergePhone}`;
    const { createId } = await import('../src/server/ids.ts');
    const mergeUserEmail = `phone-merge-${process.pid}@phone.invalid`;
    await database.prepare(`
      INSERT INTO users(id, app_id, email, password_hash, username, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      createId(), APP, mergeUserEmail, `external$${createId()}`,
      `手机用户 ${mergePhone.slice(-4)}`, nowIso(), nowIso(),
    );
    const mergeUser = await database.prepare(
      'SELECT id FROM users WHERE app_id = ? AND email = ?',
    ).get(APP, mergeUserEmail) as { id: string };
    await database.prepare(`
      INSERT INTO external_identities(id, user_id, provider, provider_subject, created_at)
      VALUES (?, ?, 'phone', ?, ?)
    `).run(createId(), mergeUser.id, mergeSubject, nowIso());

    const merged = await socialSignIn(
      { appId: APP, provider: 'huawei', authorizationCode: 'authcode-3', deviceName: 'test' },
      config, platform,
    );
    assert.equal(merged.user.id, mergeUser.id);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.HUAWEI_OAUTH_CLIENT_ID = savedClientId;
    process.env.HUAWEI_OAUTH_CLIENT_SECRET = savedClientSecret;
  }
});
