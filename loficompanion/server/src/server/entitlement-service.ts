import { database, nowIso, runTransaction } from './database';
import { createId } from './ids';
import type { MembershipTier } from '@/domain/config';

export type EntitlementRow = Readonly<{
  id: string; user_id: string; app_id: string; entitlement_key: string;
  source_order_id: string; active: number; acquired_at: string; expires_at: string | null;
}>;

export async function issueEntitlements(input: Readonly<{
  userId: string; appId: string; orderId: string; tier: MembershipTier; expiresAt: string | null;
}>) {
  await runTransaction(async () => {
    const ts = nowIso();
    for (const key of input.tier.entitlements) {
      await database.prepare(
        `UPDATE user_entitlements SET active = 0 WHERE user_id = ? AND entitlement_key = ? AND active = 1`,
      ).run(input.userId, key);
      await database.prepare(
        `INSERT INTO user_entitlements(id, user_id, app_id, entitlement_key, source_order_id, active, acquired_at, expires_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      ).run(createId(), input.userId, input.appId, key, input.orderId, ts, input.expiresAt);
    }
  });
}

export async function revokeEntitlementsForOrder(orderId: string) {
  await database.prepare(
    `UPDATE user_entitlements SET active = 0 WHERE source_order_id = ? AND active = 1`,
  ).run(orderId);
}

export async function listActiveEntitlements(
  userId: string, appId: string,
): Promise<readonly EntitlementRow[]> {
  return await database.prepare(
    `SELECT * FROM user_entitlements WHERE user_id = ? AND app_id = ? AND active = 1`,
  ).all(userId, appId) as readonly EntitlementRow[];
}
