import { ApiError } from '@/lib/apiError';
import { AUTH_BASE_URL } from '@/env';

// auth 会员域客户端（biz → 基础设施 auth）：Plus 是会员域权益
//（catalog.premium.active），皮肤门禁与 Plus 折扣定价都从这里取真相。
// 从 skins/repository.ts 迁出复用（皮肤门禁 premium 分支 + 下单 Plus 判定）。

/** Plus 会员判定：auth 权益键含 catalog.premium.active 即 Plus。 */
export function isPlusKeys(keys: readonly string[]): boolean {
  return keys.includes('catalog.premium.active');
}

/** 转发用户 Bearer 到 auth 权益查询（aud=JWT_AUDIENCE 的用户 token 原样转发）。 */
export async function fetchMembershipEntitlementKeys(authorization: string): Promise<string[]> {
  let response: Response;
  try {
    response = await fetch(`${AUTH_BASE_URL}/api/v1/membership/entitlements`, {
      headers: { authorization },
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(502, 'ENTITLEMENTS_UNAVAILABLE', '权益服务暂不可用', true);
  }
  if (!response.ok) {
    throw new ApiError(502, 'ENTITLEMENTS_UNAVAILABLE', '权益服务暂不可用', true);
  }
  const body = (await response.json()) as { data?: { keys?: string[] } };
  return body.data?.keys ?? [];
}
