import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultConfig } from '../src/domain/config.ts';
import { createSessionToken, hashToken } from '../src/server/ids.ts';
import { hashPassword, verifyPassword } from '../src/server/passwords.ts';
import { validationMessage } from '../src/server/http.ts';
import { paymentProvider } from '../src/server/payment-providers.ts';
import {
  deletionSchema,
  feedbackSchema,
  profileSchema,
  settingsSchema,
  signInSchema,
  signUpSchema,
  telemetryBatchSchema,
} from '../src/server/schemas.ts';

test('passwords use salted scrypt and reject the wrong secret', async () => {
  const first = await hashPassword('Safe-Pass-2026!');
  const second = await hashPassword('Safe-Pass-2026!');

  assert.match(first, /^scrypt\$/);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword(first, 'Safe-Pass-2026!'), true);
  assert.equal(await verifyPassword(first, 'wrong-password'), false);
});

test('session tokens are random and persisted only as hashes', () => {
  const first = createSessionToken();
  const second = createSessionToken();

  assert.notEqual(first, second);
  assert.equal(hashToken(first).length, 64);
  assert.notEqual(hashToken(first), first);
});

test('production rejects mock payment while development keeps the demo provider', () => {
  assert.throws(
    () => paymentProvider('mock', 'production'),
    (error: unknown) => error instanceof Error &&
      'code' in error && error.code === 'MOCK_PAYMENT_FORBIDDEN',
  );
  assert.equal(paymentProvider('mock', 'development').id, 'mock');
});

test('account and settings schemas reject unsafe input', () => {
  assert.equal(signUpSchema.safeParse({
    email: 'invalid',
    password: 'short',
    username: 'x',
  }).success, false);
  assert.equal(settingsSchema.safeParse({ theme: 'dark', token: 'secret' }).success, false);
  assert.equal(deletionSchema.safeParse({
    password: 'secret',
    confirmation: 'NO',
  }).success, false);
});

test('validation responses expose specific top-level and field errors', () => {
  const parsed = signUpSchema.safeParse({
    email: 'invalid',
    password: 'short',
    username: 'x',
  });
  assert.equal(parsed.success, false);
  if (parsed.success) return;
  const fieldErrors = parsed.error.flatten().fieldErrors;
  assert.match(validationMessage(fieldErrors), /邮箱格式不正确/);
  assert.deepEqual(fieldErrors.email, ['邮箱格式不正确']);
});

test('sign-in accepts username, email, and international phone identifiers', () => {
  for (const identifier of ['echo', 'echo@example.com', '+8613800000000']) {
    assert.equal(signInSchema.safeParse({
      identifier,
      password: 'Safe-Pass-2026!',
    }).success, true);
  }
});

test('profile updates display fields but reject username changes', () => {
  assert.equal(profileSchema.safeParse({
    displayName: 'Test User',
    bio: 'Zhongbei Auth test account',
  }).success, true);
  assert.equal(profileSchema.safeParse({ username: 'renamed-login' }).success, false);
});

test('feedback accepts up to three bounded image screenshots', () => {
  const screenshot = {
    fileName: 'screen.jpg',
    mimeType: 'image/jpeg',
    data: 'data:image/jpeg;base64,YQ==',
  };
  const base = {
    category: 'experience',
    title: 'Screenshot feedback',
    body: 'The screenshot shows the issue.',
  };
  assert.equal(feedbackSchema.safeParse({
    ...base,
    screenshots: [screenshot, screenshot, screenshot],
  }).success, true);
  assert.equal(feedbackSchema.safeParse({
    ...base,
    screenshots: [screenshot, screenshot, screenshot, screenshot],
  }).success, false);
});

test('default legal configuration publishes complete three-document set', () => {
  assert.deepEqual(
    defaultConfig.legal.map((document) => document.type),
    ['privacy', 'terms', 'subscription'],
  );
  for (const document of defaultConfig.legal) {
    assert.ok(document.content.length > 300);
    assert.match(document.content, /生效日期/);
  }
});

test('telemetry enforces bounded batches and safe scalar properties', () => {
  const event = {
    eventId: 'event-123456',
    name: 'screen_view',
    screenId: 'home',
    occurredAt: new Date().toISOString(),
    configVersion: 1,
    properties: { source: 'test' },
  };
  assert.equal(telemetryBatchSchema.safeParse({
    anonymousId: 'anonymous-123',
    sessionId: 'session-123',
    events: [event],
  }).success, true);
  assert.equal(telemetryBatchSchema.safeParse({
    anonymousId: 'anonymous-123',
    sessionId: 'session-123',
    events: Array.from({ length: 51 }, () => event),
  }).success, false);
});
