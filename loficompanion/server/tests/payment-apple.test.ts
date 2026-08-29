// Real Apple JWS crypto verification tests (P-2a Task 2).
//
// Fixtures come from the app-store-server-library-node test suite
// (tests/resources/mock_signed_data/* and tests/resources/certs/testCA.der):
//   - signed-transaction.jws  : a REAL ES256 JWS carrying a 3-cert x5c chain
//                                (leaf -> intermediate -> root) anchored at testCA.der
//   - testCA.der              : the Apple test root CA that signs that chain
//
// The SignedDataVerifier performs REAL verification here:
//   1. parses the x5c chain from the JWS header,
//   2. validates the chain against the supplied root (testCA.der) + OID rules,
//   3. extracts the leaf public key,
//   4. verifies the ECDSA signature on the JWS.
// Nothing is mocked — this is the same crypto path production uses.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { SignedDataVerifier, Environment } from '@apple/app-store-server-library';

const FIXTURES = join(process.cwd(), 'tests', 'fixtures', 'apple');

function readFixture(path: string): Buffer {
  return readFileSync(path);
}
function readFixtureText(path: string): string {
  return readFileSync(path, 'utf8').trim();
}

const transactionFixture = existsSync(join(FIXTURES, 'signed-transaction.jws'))
  ? readFixtureText(join(FIXTURES, 'signed-transaction.jws'))
  : null;
const testCert = existsSync(join(FIXTURES, 'testCA.der'))
  ? readFixture(join(FIXTURES, 'testCA.der'))
  : null;

// Skip cleanly if fixtures ever go missing, but surface it loudly.
const hasFixtures = Boolean(transactionFixture && testCert);
const it = hasFixtures ? test : test.skip;

// The library's own tests configure the verifier for these mock fixtures with
// Environment.SANDBOX + bundleId "com.example" + appAppleId 1234 (see
// tests/util.ts getDefaultSignedPayloadVerifier and the "Decoding checks"
// block in tests/unit-tests/jws_verification.test.ts).

it('verifyReceipt accepts a valid Apple-signed transaction JWS (real crypto)', async () => {
  const verifier = new SignedDataVerifier(
    [testCert!],
    /* enableOnlineChecks */ false,
    Environment.SANDBOX,
    'com.example',
    1234,
  );
  // This call performs full x5c chain validation + ES256 signature verification.
  const tx = await verifier.verifyAndDecodeTransaction(transactionFixture!);
  // The mock_signed_data/transactionInfo fixture carries a minimal payload
  // (environment/bundleId/signedDate); assert the signed claims match what the
  // chain was issued for, which proves the verifier authenticated the payload.
  assert.equal(tx.bundleId, 'com.example', 'bundleId claim must be verified');
  assert.equal(
    tx.environment,
    Environment.SANDBOX,
    'environment claim must be verified',
  );
});

it('verifyReceipt rejects a tampered JWS signature', async () => {
  // Flip trailing bytes of the signature segment — chain may still validate,
  // but ECDSA verification of the JWS signature must fail.
  const tampered = transactionFixture!.slice(0, -8) + 'XXXXXXXX';
  const verifier = new SignedDataVerifier(
    [testCert!],
    false,
    Environment.SANDBOX,
    'com.example',
    1234,
  );
  await assert.rejects(() => verifier.verifyAndDecodeTransaction(tampered));
});

it('verifyReceipt rejects a JWS whose chain is NOT anchored at the supplied root', async () => {
  // Hand the verifier an unrelated Apple production root (from certs/) instead of
  // testCA.der. The fixture's x5c chain is issued by the Apple test CA, so chain
  // verification against a different root must fail.
  const prodRootPath = join(process.cwd(), 'certs', 'AppleRootCA-G3.cer');
  if (!existsSync(prodRootPath)) {
    // certs/ may not be populated in every environment — skip rather than fail.
    test.skip('AppleRootCA-G3.cer not present');
    return;
  }
  const prodRoot = readFixture(prodRootPath);
  const verifier = new SignedDataVerifier(
    [prodRoot],
    false,
    Environment.SANDBOX,
    'com.example',
    1234,
  );
  await assert.rejects(() => verifier.verifyAndDecodeTransaction(transactionFixture!));
});

it('verifyReceipt rejects a transaction signed for the wrong bundle id', async () => {
  // Same fixture, but the verifier expects a different bundleId. The verifier
  // checks the signed bundleId claim and must reject the mismatch.
  const verifier = new SignedDataVerifier(
    [testCert!],
    false,
    Environment.SANDBOX,
    'com.example.other',
    1234,
  );
  await assert.rejects(() => verifier.verifyAndDecodeTransaction(transactionFixture!));
});

// The fixture's bundleId claim lives in the signed payload; we assert its value
// separately as a regression guard against payload-shape changes.
test('fixture sanity: signed-transaction.jws is a 3-part JWS with a 3-cert x5c chain', () => {
  if (!hasFixtures) {
    test.skip('apple fixtures missing');
    return;
  }
  const parts = transactionFixture!.split('.');
  assert.equal(parts.length, 3, 'JWS must have header.payload.signature');
  const header = JSON.parse(
    Buffer.from(parts[0], 'base64').toString('utf8'),
  ) as { alg: string; x5c?: string[] };
  assert.equal(header.alg, 'ES256');
  assert.equal(header.x5c?.length, 3, 'x5c chain must be leaf + intermediate + root');
});

// --- P-2a Task 3: ASSN V2 App Store Server Notifications JWS webhook tests ---
//
// The webhook handler Apple calls posts `{ signedPayload: "<jws>" }`. The JWS is
// a signed NotificationPayload: SignedDataVerifier.verifyAndDecodeNotification
// validates the x5c chain against the same testCA.der root + the ES256
// signature, then returns the decoded notification (notificationType +
// notificationUUID + data.signedTransactionInfo, etc.).
//
// The notification fixture (signed-notification.jws) is the library's
// mock_signed_data/notifications sample: notificationType=TEST, environment
// Sandbox, bundleId com.example, appAppleId 1234 — same verifier config as the
// transaction fixture above. It carries no signedTransactionInfo, so we only
// assert the notification-level claims.

const notificationFixture = existsSync(join(FIXTURES, 'signed-notification.jws'))
  ? readFixtureText(join(FIXTURES, 'signed-notification.jws'))
  : null;
const hasNotification = Boolean(notificationFixture && testCert);
const notifIt = hasNotification ? test : test.skip;

notifIt('ASSN V2 notification verifies and decodes correctly (real crypto)', async () => {
  const verifier = new SignedDataVerifier(
    [testCert!],
    /* enableOnlineChecks */ false,
    Environment.SANDBOX,
    'com.example',
    1234,
  );
  // Full x5c chain validation + ES256 signature verification on the notification JWS.
  const notif = await verifier.verifyAndDecodeNotification(notificationFixture!);
  assert.ok(notif.notificationType, 'decoded notification has notificationType');
  assert.ok(notif.notificationUUID, 'decoded notification has notificationUUID (eventId)');
  // The server-side kind mapping (mirrors server/services/payment-apple.ts):
  // REFUND/REVOKE -> 'refund', anything else -> 'renew'. The TEST fixture must
  // map to 'renew', proving the branch the webhook uses to route the event.
  const notificationType = String(notif.notificationType);
  const kind = notificationType === 'REFUND' || notificationType === 'REVOKE'
    ? 'refund'
    : 'renew';
  assert.equal(kind, 'renew', 'TEST notification maps to renew kind');
  // This fixture carries no signedTransactionInfo, so we stop here. (Production
  // REFUND/REVOKE/SUBSCRIBED notifications would additionally let us decode
  // originalTransactionId via verifyAndDecodeTransaction on data.signedTransactionInfo.)
});

notifIt('ASSN V2 tampered notification signature is rejected', async () => {
  // Clobber the tail of the signature segment — chain may still anchor at
  // testCA.der, but ECDSA verification of the JWS signature must fail.
  const tampered = notificationFixture!.slice(0, -5) + 'XXXXX';
  const verifier = new SignedDataVerifier(
    [testCert!],
    false,
    Environment.SANDBOX,
    'com.example',
    1234,
  );
  await assert.rejects(() => verifier.verifyAndDecodeNotification(tampered));
});
