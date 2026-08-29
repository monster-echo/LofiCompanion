import { createHash } from 'node:crypto';
import { runTransaction } from './database';
import { revokeEntitlementsForOrder } from './entitlement-service';
import { findOrderById, insertWebhookEventIfNew, refundOrder } from './order-repository';
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
    }
    // kind === 'renew': subscription renew_at already set by verifyPurchase; real renewal in P-2/3/4.
    return { applied: true };
  });
}
