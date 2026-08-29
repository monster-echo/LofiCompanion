import { z } from 'zod';
import { orderSchema, verifyPurchaseSchema, restorePurchasesSchema } from './schemas';

const membershipEntitlementsSchema = z.object({
  keys: z.array(z.string()),
});

export const paymentContractSnapshot = z.toJSONSchema(z.object({
  orderRequest: orderSchema,
  verifyRequest: verifyPurchaseSchema,
  restoreRequest: restorePurchasesSchema,
  membershipEntitlementsResponse: membershipEntitlementsSchema,
}), { unrepresentable: 'any' });
