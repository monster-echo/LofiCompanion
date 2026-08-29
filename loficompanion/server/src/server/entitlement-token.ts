import { createHmac } from 'node:crypto';

/**
 * Generic HMAC-signed entitlement token, shared with per-app backends.
 * Format: base64url(payload).base64url(hmac_sha256(payload))
 *
 * Verifiers (e.g. an app-specific backend) confirm Pro status by checking the
 * signature against the same ENTITLEMENT_SIGNING_SECRET and the payload's exp.
 * This is generic multi-tenant infrastructure — no app-specific business logic.
 */
export type EntitlementClaims = {
  exp: number; // epoch seconds
  appId: string;
  tier: string;
  [key: string]: unknown;
};

export function signEntitlementToken(claims: EntitlementClaims): string {
  const secret = process.env.ENTITLEMENT_SIGNING_SECRET;
  if (!secret || secret.length === 0) {
    throw new Error('ENTITLEMENT_SIGNING_SECRET is not configured');
  }
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

/** Token lifetime in seconds. Short enough to limit abuse, long enough to avoid hammering. */
export const ENTITLEMENT_TTL_SECONDS = 60 * 60; // 1 hour
