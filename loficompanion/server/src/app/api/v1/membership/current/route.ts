import { NextRequest } from 'next/server';
import { requireAuth } from '@/server/auth';
import { handleError, ok } from '@/server/http';
import { listActiveEntitlements } from '@/server/entitlement-service';
import { database } from '@/server/database';

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const entitlements = await listActiveEntitlements(user.id, user.app_id);
    const sub = await database.prepare(
      `SELECT plan_id AS planId, status, renew_at AS renewAt FROM subscriptions
       WHERE user_id = ? AND app_id = ? ORDER BY updated_at DESC LIMIT 1`,
    ).get(user.id, user.app_id) as { planId: string; status: string; renewAt: string | null } | undefined;
    return ok({
      tier: user.tier_id ?? null,
      entitlements: entitlements.map((e) => ({ key: e.entitlement_key, expiresAt: e.expires_at })),
      subscription: sub ?? null,
    });
  } catch (error) {
    return handleError(error);
  }
}
