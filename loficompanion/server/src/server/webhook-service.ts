import { createHash } from 'node:crypto';
import { runTransaction } from './database';
import { renewEntitlementsForOrder, revokeEntitlementsForOrder } from './entitlement-service';
import {
  expireSubscriptionByOrder,
  findOrderById,
  insertWebhookEventIfNew,
  refundOrder,
  touchSubscriptionRenewAt,
  updateOrderExpiry,
} from './order-repository';
import { paymentProvider, type PaymentProviderId } from './payment-providers';

export async function applyWebhook(
  provider: PaymentProviderId,
  rawBody: Buffer,
  headers: Readonly<Record<string, string>>,
): Promise<{ applied: boolean; deduplicated?: boolean }> {
  const adapter = paymentProvider(provider, 'development');
  const event = await adapter.parseWebhook(rawBody, headers);
  if (!event) return { applied: false };

  const payloadHash = createHash('sha256').update(rawBody).digest('hex');
  return await runTransaction(async () => {
    const inserted = await insertWebhookEventIfNew({
      provider: event.provider, eventId: event.eventId, payloadHash,
    });
    if (!inserted) return { applied: false, deduplicated: true };

    const order = await findOrderById(event.orderId);
    if (!order) return { applied: false };

    if (event.kind === 'refund') {
      await refundOrder(event.orderId);
      await revokeEntitlementsForOrder(event.orderId);
      return { applied: true };
    }
    if (event.kind === 'expire') {
      // 到期失效：撤销权益 + 订阅行标记 expired（订单行保留作历史）
      await revokeEntitlementsForOrder(event.orderId);
      await expireSubscriptionByOrder(event.orderId);
      return { applied: true };
    }
    // kind === 'renew'：按商店回传的新到期时刻重发权益并延长订单行。
    // 权益从未发放过（无 prior 行）或缺少 expiresAt 时不做任何事——
    // 到期谓词（entitlement-service）保证过期权益不会误发。
    if (!event.expiresAt) return { applied: true };
    const renewed = await renewEntitlementsForOrder({
      orderId: event.orderId, userId: order.userId, expiresAt: event.expiresAt,
    });
    if (renewed) {
      await updateOrderExpiry(event.orderId, event.expiresAt);
      await touchSubscriptionRenewAt(event.orderId, event.expiresAt);
    }
    return { applied: true };
  });
}
