import type { NextRequest } from 'next/server';
import { handleError, ok } from '@/lib/http';
import { requireIdentity } from '@/lib/identity';
import { listActiveSkinEntitlementKeys } from '@/features/store/data/entitlement-service';

export const dynamic = 'force-dynamic';

// 已拥有皮肤权益键（skin.official.*）：商店「已拥有」徽标/画廊判锁/快切判锁
// 的所有权来源。会员 Plus 键（catalog.premium.active）仍在基础设施 auth 的
// /membership/entitlements——客户端聚合两侧键集。
export async function GET(request: NextRequest) {
  try {
    const identity = await requireIdentity(request);
    const entitlements = await listActiveSkinEntitlementKeys(identity.userId);
    return ok({ entitlements });
  } catch (error) {
    return handleError(error);
  }
}
