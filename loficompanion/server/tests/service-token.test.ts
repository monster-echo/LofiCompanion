import assert from 'node:assert/strict';
import test, { after } from 'node:test';
const { database } = await import('../src/server/database.ts');
const { grantClientCredentials, verifyServiceToken } = await import('../src/server/service-clients.ts');

/**
 * 服务间 client credentials 契约测试（RFC 6749 §4.4）：凭证校验、scope 子集、
 * 服务 token 签发/验签（用户 token 不可冒用服务 token，反之亦然）。
 */

const SECRET = 'unit-test-secret';
// 独立 client_id：本地 dev 的 env 引导种子（lofi-biz）已占用真实 secret，测试自包含
const CID = `test-svc-${process.pid}`;
const HEAD = { usedHeaderAuth: true };

after(async () => database.close());

test('错误 grant_type → unsupported_grant_type；错误凭证 → invalid_client', async () => {
  const badGrant = await grantClientCredentials({ grantType: 'password', clientId: 'x', clientSecret: 'y', scope: null, ...HEAD });
  assert.equal(badGrant.ok, false);
  assert.equal(badGrant.error, 'unsupported_grant_type');

  const noSeed = await grantClientCredentials({ grantType: 'client_credentials', clientId: 'ghost', clientSecret: 'x', scope: null, ...HEAD });
  assert.equal(noSeed.ok, false);
  assert.equal(noSeed.error, 'invalid_client');
});

test('env 引导注册 → 换发 token → 验签含 scope；越权 scope 拒绝', async () => {
  process.env.INTERNAL_CLIENT_ID = CID;
  process.env.INTERNAL_CLIENT_SECRET = SECRET;

  // 未注册 scope → invalid_scope
  const badScope = await grantClientCredentials({ grantType: 'client_credentials', clientId: CID, clientSecret: SECRET, scope: 'users:write', ...HEAD });
  assert.equal(badScope.ok, false);
  assert.equal(badScope.error, 'invalid_scope');

  // 正常换发（缺省 scope = 注册 scope）
  const grant = await grantClientCredentials({ grantType: 'client_credentials', clientId: CID, clientSecret: SECRET, scope: null, ...HEAD });
  assert.equal(grant.ok, true);
  if (!grant.ok) return;
  // 缺省 scope = 注册全集（profiles:read store:write）
  assert.ok(grant.scope.includes('profiles:read') && grant.scope.includes('store:write'));
  assert.equal(grant.expiresIn, 3600);

  // 服务 token 可验签且 scope 正确
  const service = await verifyServiceToken(grant.accessToken, 'profiles:read');
  assert.ok(service);
  assert.equal(service!.clientId, CID);

  // 缺 scope 的服务 token 拒绝 + 用户 access token 冒用服务 token 拒绝
  const noScope = await verifyServiceToken(grant.accessToken, 'users:write');
  assert.equal(noScope, null);
  const userToken = await (await import('../src/server/jwt.ts')).signAccessToken({
    userId: 'u1', appId: 'loficompanion', sessionId: 's1', ttlMs: 60_000,
  });
  assert.equal(await verifyServiceToken(userToken, 'profiles:read'), null);
});

test('client_secret 错误 → invalid_client（正确密钥比对 sha256 落库值）', async () => {
  const wrong = await grantClientCredentials({ grantType: 'client_credentials', clientId: 'lofi-biz', clientSecret: 'wrong-secret', scope: null, ...HEAD });
  assert.equal(wrong.ok, false);
  assert.equal(wrong.error, 'invalid_client');

  // DB 只存哈希：secret 明文不可见
  const row = await database.prepare(
    'SELECT secret_hash FROM service_clients WHERE client_id = ?',
  ).get(CID) as { secret_hash: string };
  assert.ok(!row.secret_hash.includes(SECRET));
  assert.equal(row.secret_hash.length, 64);
});
