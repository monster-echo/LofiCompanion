import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleError, ok } from '@/lib/http';
import { requireIdentity } from '@/lib/identity';
import { getClientPlatform } from '@/lib/client-platform';
import { restoreSkinPurchases } from '@/features/store/data/order-service';
import { listActiveSkinEntitlementKeys } from '@/features/store/data/entitlement-service';

export const dynamic = 'force-dynamic';

const restoreSkinPurchasesSchema = z.object({
  receipts: z.array(z.unknown()).min(1).max(50),
});

// 皮肤恢复购买（biz 版；会员 restore 仍在基础设施 auth）：原生 restore 返回
// 的收据逐张验证，皮肤权益补发后返回已拥有皮肤权益键。
export async function POST(request: NextRequest) {
  try {
    const identity = await requireIdentity(request);
    const input = restoreSkinPurchasesSchema.parse(await request.json());
    await restoreSkinPurchases({
      appId: identity.appId,
      environment: request.headers.get('x-app-environment')?.trim() || 'development',
      userId: identity.userId,
      receipts: input.receipts,
      platform: getClientPlatform(request),
    });
    const entitlements = await listActiveSkinEntitlementKeys(identity.userId);
    return ok({ entitlements });
  } catch (error) {
    return handleError(error);
  }
}
