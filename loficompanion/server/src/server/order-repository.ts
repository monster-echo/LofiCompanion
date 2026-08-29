import { database, nowIso, runTransaction } from './database';
import { createId } from './ids';
import type { ClientPlatform } from './client-context';
import type { PaymentProviderId } from './payment-providers';

export type OrderStatus = 'pending' | 'processing' | 'success' | 'failed' | 'refunded';

export type OrderView = Readonly<{
  id: string;
  userId: string;
  planId: string;
  tierId: string | null;
  status: OrderStatus;
  amountMinor: number;
  currency: string;
  provider: string;
  storeTransactionId: string | null;
  receiptHash: string | null;
  expiresAt: string | null;
  createdAt: string;
  completedAt: string | null;
}>;

const COLUMNS = `
  id, user_id AS userId, plan_id AS planId, tier_id AS tierId,
  status, amount_minor AS amountMinor, currency, provider,
  store_transaction_id AS storeTransactionId, receipt_hash AS receiptHash,
  expires_at AS expiresAt, created_at AS createdAt, completed_at AS completedAt
`;

function mapStatus(s: string): OrderStatus {
  return (['pending', 'processing', 'success', 'failed', 'refunded'].includes(s) ? s : 'pending') as OrderStatus;
}

type OrderRow = Omit<OrderView, 'status'> & { status: string };

function toView(row: OrderRow | undefined): OrderView {
  if (!row) throw new Error('order row not found');
  return { ...row, status: mapStatus(row.status) };
}

export async function listOrders(userId: string): Promise<readonly OrderView[]> {
  const rows = await database.prepare(
    `SELECT ${COLUMNS} FROM orders WHERE user_id = ? ORDER BY created_at DESC`,
  ).all<OrderRow>(userId);
  return rows.map(toView);
}

export async function findOrder(userId: string, idempotencyKey: string): Promise<OrderView | undefined> {
  const row = await database.prepare(
    `SELECT ${COLUMNS} FROM orders WHERE user_id = ? AND idempotency_key = ?`,
  ).get<OrderRow>(userId, idempotencyKey);
  return row ? toView(row) : undefined;
}

export async function findOrderById(orderId: string): Promise<OrderView | undefined> {
  const row = await database.prepare(`SELECT ${COLUMNS} FROM orders WHERE id = ?`).get<OrderRow>(orderId);
  return row ? toView(row) : undefined;
}

export async function findOrderByReceiptHash(userId: string, receiptHash: string): Promise<OrderView | undefined> {
  const row = await database.prepare(
    `SELECT ${COLUMNS} FROM orders WHERE user_id = ? AND receipt_hash = ?`,
  ).get<OrderRow>(userId, receiptHash);
  return row ? toView(row) : undefined;
}

export async function findOrderByStoreTransactionId(storeTransactionId: string): Promise<OrderView | undefined> {
  const row = await database.prepare(
    `SELECT ${COLUMNS} FROM orders WHERE store_transaction_id = ?`,
  ).get<OrderRow>(storeTransactionId);
  return row ? toView(row) : undefined;
}

type NewPending = Readonly<{
  userId: string;
  planId: string;
  tierId: string;
  idempotencyKey: string;
  amountMinor: number;
  currency: string;
  provider: PaymentProviderId;
}>;

export async function insertPendingOrder(input: NewPending): Promise<OrderView> {
  const orderId = createId();
  const ts = nowIso();
  await database.prepare(
    `INSERT INTO orders(id, user_id, plan_id, tier_id, idempotency_key, status, amount_minor, currency, provider, created_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
  ).run(orderId, input.userId, input.planId, input.tierId, input.idempotencyKey,
    input.amountMinor, input.currency, input.provider, ts);
  const row = await database.prepare(`SELECT ${COLUMNS} FROM orders WHERE id = ?`).get<OrderRow>(orderId);
  return toView(row);
}

export async function markProcessing(orderId: string): Promise<void> {
  await database.prepare(`UPDATE orders SET status = 'processing' WHERE id = ?`).run(orderId);
}

export async function completeOrder(orderId: string, input: Readonly<{
  storeTransactionId: string; receiptHash: string; expiresAt: string | null;
}>): Promise<OrderView> {
  const ts = nowIso();
  await database.prepare(
    `UPDATE orders SET status = 'success', store_transaction_id = ?, receipt_hash = ?, expires_at = ?, completed_at = ? WHERE id = ?`,
  ).run(input.storeTransactionId, input.receiptHash, input.expiresAt, ts, orderId);
  const row = await database.prepare(`SELECT ${COLUMNS} FROM orders WHERE id = ?`).get<OrderRow>(orderId);
  return toView(row);
}

export async function failOrder(orderId: string): Promise<void> {
  await database.prepare(`UPDATE orders SET status = 'failed', completed_at = ? WHERE id = ?`).run(nowIso(), orderId);
}

export async function refundOrder(orderId: string): Promise<void> {
  await database.prepare(`UPDATE orders SET status = 'refunded' WHERE id = ?`).run(orderId);
}

export async function insertWebhookEventIfNew(input: Readonly<{
  provider: string; eventId: string; payloadHash: string;
}>): Promise<boolean> {
  return await runTransaction(async () => {
    const existing = await database.prepare(
      `SELECT id FROM webhook_events WHERE provider = ? AND event_id = ?`,
    ).get(input.provider, input.eventId);
    if (existing) return false;
    await database.prepare(
      `INSERT INTO webhook_events(id, provider, event_id, payload_hash, processed, received_at)
       VALUES (?, ?, ?, ?, 1, ?)`,
    ).run(createId(), input.provider, input.eventId, input.payloadHash, nowIso());
    return true;
  });
}

type SubInput = Readonly<{
  userId: string; appId: string; planId: string; platform: ClientPlatform | string;
  status: string; currentOrderId: string; renewAt: string | null;
}>;

export async function upsertSubscription(input: SubInput): Promise<void> {
  const ts = nowIso();
  await database.prepare(
    `INSERT INTO subscriptions(id, user_id, app_id, plan_id, platform, status, current_order_id, renew_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, app_id, plan_id) DO UPDATE SET
       status = excluded.status, current_order_id = excluded.current_order_id,
       renew_at = excluded.renew_at, updated_at = excluded.updated_at`,
  ).run(createId(), input.userId, input.appId, input.planId, input.platform,
    input.status, input.currentOrderId, input.renewAt, ts, ts);
}

type SubscriptionRow = {
  current_order_id: string;
  status: string;
  renew_at: string | null;
};

export async function getCurrentSubscription(
  userId: string, appId: string, planId: string,
): Promise<SubscriptionRow | undefined> {
  return await database.prepare(
    `SELECT current_order_id, status, renew_at FROM subscriptions
     WHERE user_id = ? AND app_id = ? AND plan_id = ?`,
  ).get<SubscriptionRow>(userId, appId, planId);
}
