import { randomUUID } from 'node:crypto';
import { getDb } from '@/db';
import type { SkinOrder } from '@prisma/client';

// 皮肤订单仓储（P4 自基础设施 auth 迁入；自包含生命周期，不复用基础设施
// orders 表）。状态机：pending → processing → success | failed；refunded 预留
//（皮肤为非消耗型买断，退款走商店后台人工 + 下轮版本 webhook 撤销）。

export type SkinOrderStatus = 'pending' | 'processing' | 'success' | 'failed' | 'refunded';

export type SkinOrderRow = SkinOrder;

export interface InsertSkinOrderInput {
  userId: string;
  skinId: string;
  entitlementKey: string;
  idempotencyKey: string;
  amountMinor: number;
  currency: string;
  provider: string;
}

/** 幂等插入：同 (user, idempotencyKey) 返回既有订单（同键同单）。 */
export async function insertSkinOrderIfAbsent(input: InsertSkinOrderInput): Promise<SkinOrderRow> {
  const existing = await getDb().skinOrder.findUnique({
    where: { user_id_idempotency_key: { user_id: input.userId, idempotency_key: input.idempotencyKey } },
  });
  if (existing) return existing;
  try {
    return await getDb().skinOrder.create({
      data: {
        id: randomUUID(),
        user_id: input.userId,
        skin_id: input.skinId,
        entitlement_key: input.entitlementKey,
        idempotency_key: input.idempotencyKey,
        amount_minor: input.amountMinor,
        currency: input.currency,
        provider: input.provider,
        status: 'pending',
        created_at: new Date().toISOString(),
      },
    });
  } catch {
    // 并发窗口兜底：UNIQUE(user_id, idempotency_key) 冲突 → 读回既有订单
    const raced = await getDb().skinOrder.findUnique({
      where: { user_id_idempotency_key: { user_id: input.userId, idempotency_key: input.idempotencyKey } },
    });
    if (!raced) throw new Error('skin order insert raced and row is missing');
    return raced;
  }
}

export async function findSkinOrderById(orderId: string): Promise<SkinOrderRow | undefined> {
  const row = await getDb().skinOrder.findUnique({ where: { id: orderId } });
  return row ?? undefined;
}

export async function markSkinOrderProcessing(orderId: string): Promise<void> {
  await getDb().skinOrder.updateMany({
    where: { id: orderId, status: 'pending' },
    data: { status: 'processing' },
  });
}

export async function completeSkinOrder(
  orderId: string,
  data: { storeTransactionId: string; receiptHash: string },
): Promise<SkinOrderRow> {
  return await getDb().skinOrder.update({
    where: { id: orderId },
    data: {
      status: 'success',
      store_transaction_id: data.storeTransactionId,
      receipt_hash: data.receiptHash,
      completed_at: new Date().toISOString(),
    },
  });
}

export async function failSkinOrder(orderId: string): Promise<SkinOrderRow> {
  return await getDb().skinOrder.update({
    where: { id: orderId },
    data: { status: 'failed', completed_at: new Date().toISOString() },
  });
}
