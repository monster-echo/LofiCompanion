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
  const now = nowIso();
  // 惰性清扫：先把本人已过期行翻 inactive（无定时器依赖；expires_at 谓词兜底
  // 保证即使未清扫也不会把过期权益发给查询方）。
  await database.prepare(
    `UPDATE user_entitlements SET active = 0
     WHERE user_id = ? AND app_id = ? AND active = 1 AND expires_at IS NOT NULL AND expires_at <= ?`,
  ).run(userId, appId, now);
  return await database.prepare(
    `SELECT * FROM user_entitlements
     WHERE user_id = ? AND app_id = ? AND active = 1 AND (expires_at IS NULL OR expires_at > ?)`,
  ).all(userId, appId, now) as readonly EntitlementRow[];
}

/**
 * 续订：把订单曾发放过的权益键按新 expires_at 重新激活（幂等——同键先翻
 * inactive 再插入新行）。appId 从既有权益行反查（orders 表不含 app_id）。
 * 返回 false 表示该订单从未发放过权益（无从续订）。
 */
export async function renewEntitlementsForOrder(input: Readonly<{
  orderId: string; userId: string; expiresAt: string;
}>): Promise<boolean> {
  const prior = await database.prepare(
    `SELECT DISTINCT entitlement_key, app_id FROM user_entitlements WHERE source_order_id = ?`,
  ).all(input.orderId) as readonly { entitlement_key: string; app_id: string }[];
  if (prior.length === 0) return false;
  const appId = prior[0]!.app_id;
  await runTransaction(async () => {
    for (const { entitlement_key: key } of prior) {
      await database.prepare(
        `UPDATE user_entitlements SET active = 0 WHERE user_id = ? AND entitlement_key = ? AND active = 1`,
      ).run(input.userId, key);
      await database.prepare(
        `INSERT INTO user_entitlements(id, user_id, app_id, entitlement_key, source_order_id, active, acquired_at, expires_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      ).run(createId(), input.userId, appId, key, input.orderId, nowIso(), input.expiresAt);
    }
  });
  return true;
}
