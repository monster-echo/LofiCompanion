import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.APP_ID = 'test-biz-app';
process.env.AUTH_BASE_URL = 'https://auth.example.test';

const { extractBearerToken } = await import('../src/auth/jwt.ts');

test('extractBearerToken parses the Authorization header', () => {
  assert.equal(extractBearerToken('Bearer abc.def.ghi'), 'abc.def.ghi');
  assert.equal(extractBearerToken('bearer abc'), 'abc');
  assert.equal(extractBearerToken('Basic xyz'), null);
  assert.equal(extractBearerToken(null), null);
  assert.equal(extractBearerToken('Bearer'), null);
  assert.equal(extractBearerToken('Bearer   '), null);
});
