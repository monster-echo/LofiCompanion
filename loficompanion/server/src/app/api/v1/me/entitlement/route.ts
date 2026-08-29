import { NextRequest } from 'next/server';
import { requireAuth } from '@/server/auth';
import { handleError, ok } from '@/server/http';
import { ENTITLEMENT_TTL_SECONDS, signEntitlementToken } from '@/server/entitlement-token';

/**
 * POST /api/v1/me/entitlement
 *
 * Returns a short-lived HMAC-signed entitlement token for the calling user.
 * App-specific backends verify it (with the shared ENTITLEMENT_SIGNING_SECRET)
 * to grant Pro-tier quota. Free users receive `{ token: null }`.
 *
 * A user is considered Pro when their `tier_id` is set (assigned on a successful
 * paid order; cleared on refund/expiry by the order service).
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const tierId = user.tier_id;
    const isPro = tierId !== null && tierId.length > 0;
    if (!isPro) {
      return ok({ token: null as string | null, expiresAt: null as number | null });
    }
    const exp = Math.floor(Date.now() / 1000) + ENTITLEMENT_TTL_SECONDS;
    const token = signEntitlementToken({ exp, appId: user.app_id, tier: tierId });
    return ok({ token, expiresAt: exp });
  } catch (error) {
    return handleError(error);
  }
}
