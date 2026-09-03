import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { getDb } from '@/db';

// 皮肤权益（P4 起所有权数据归 biz）：skin.official.{slug} 键在此发放与查询。
// 皮肤为非消耗型买断——expires_at 恒 null（保留列对齐通用权益形态）；
// 退款撤销置 active=false。UNIQUE(user_id, entitlement_key) 保证幂等。

/** 同事务发放（verify 成功路径调用；已存在同键行则复活为 active）。 */
export async function grantSkinEntitlementInTx(
  tx: Prisma.TransactionClient,
  input: { userId: string; entitlementKey: string; sourceOrderId: string },
): Promise<void> {
  const now = new Date().toISOString();
  await tx.skinEntitlement.upsert({
    where: {
      user_id_entitlement_key: {
        user_id: input.userId,
        entitlement_key: input.entitlementKey,
      },
    },
    create: {
      id: randomUUID(),
      user_id: input.userId,
      entitlement_key: input.entitlementKey,
      source_order_id: input.sourceOrderId,
      active: true,
      expires_at: null,
      created_at: now,
    },
    update: { active: true, source_order_id: input.sourceOrderId },
  });
}

export async function hasActiveSkinEntitlement(
  userId: string,
  entitlementKey: string,
): Promise<boolean> {
  const row = await getDb().skinEntitlement.findUnique({
    where: { user_id_entitlement_key: { user_id: userId, entitlement_key: entitlementKey } },
  });
  return Boolean(row?.active);
}

/** 已拥有皮肤权益键（商店/画廊/快切判拥有；未拥有返回空集）。 */
export async function listActiveSkinEntitlementKeys(userId: string): Promise<string[]> {
  const rows = await getDb().skinEntitlement.findMany({
    where: { user_id: userId, active: true },
    select: { entitlement_key: true },
  });
  return rows.map((row) => row.entitlement_key);
}
