import { ApiError } from '@/lib/apiError';
import { getDb } from '@/db';
import {
  grantSkinTrialEntitlement,
  hasActiveSkinEntitlement,
} from './entitlement-service';

// 皮肤免费试用（24h 随便用）：每皮肤每用户限一次。权益侧复用 skin_entitlements
// （skin.trial.{slug} 键 + expires_at 窗口，无新迁移）；「限一次」由该表
// UNIQUE(user_id, entitlement_key) 行的存在性表达——行存在（含过期）即 409。
// 门禁侧 manifest 端点经 listUsableSkinEntitlementKeys 认窗口内试用键；
// 拥有键集（商店「已拥有」语义）永远过滤试用键。

/** 试用窗口时长（小时）：env 可调（E2E 短 TTL 旋钮），缺省 24。 */
export function trialTtlHours(): number {
  const raw = Number(process.env.SKIN_TRIAL_TTL_HOURS ?? '');
  return Number.isFinite(raw) && raw > 0 ? raw : 24;
}

export type SkinTrialStartResult =
  | { status: 'owned' }
  | { status: 'started'; slug: string; entitlementKey: string; expiresAt: string };

export async function startSkinTrial(input: {
  userId: string;
  skinIdOrSlug: string;
  nowIso: string;
}): Promise<SkinTrialStartResult> {
  const db = getDb();
  const skin = await db.skin.findFirst({
    where: {
      OR: [{ id: input.skinIdOrSlug }, { slug: input.skinIdOrSlug }],
      published_at: { not: null },
      moderation_status: 'approved',
    },
  });
  if (!skin) throw new ApiError(404, 'SKIN_NOT_FOUND', '皮肤不存在');
  // 只开放 paid 皮肤试用（premium 是会员域权益，由 Plus 订阅承载；free 无需试用）
  if (skin.access_type !== 'paid') {
    throw new ApiError(422, 'SKIN_TRIAL_NOT_ELIGIBLE', '该皮肤不支持免费试用');
  }
  const product = await db.skinProduct.findUnique({ where: { skin_id: skin.id } });
  if (!product || product.status !== 'active') {
    throw new ApiError(422, 'SKIN_TRIAL_NOT_ELIGIBLE', '该皮肤商品未在售，暂不可试用');
  }
  // 已拥有（正式权益在身）→ 无需试用，直接告知
  if (await hasActiveSkinEntitlement(input.userId, product.entitlement_key)) {
    return { status: 'owned' };
  }
  // 一次性：trial 行存在（含已过期）即拒绝——不读 active/expires 判断「还能不能试」
  const entitlementKey = `skin.trial.${skin.slug}`;
  const existing = await db.skinEntitlement.findUnique({
    where: { user_id_entitlement_key: { user_id: input.userId, entitlement_key: entitlementKey } },
  });
  if (existing) {
    throw new ApiError(409, 'SKIN_TRIAL_ALREADY_USED', '该皮肤的免费试用已用过');
  }
  const granted = await grantSkinTrialEntitlement({
    userId: input.userId,
    slug: skin.slug,
    nowIso: input.nowIso,
    ttlHours: trialTtlHours(),
  });
  // 并发窗口：另一请求抢先发放 → 同「已用过」语义（窗口以先到者为准）
  if (!granted.created) {
    throw new ApiError(409, 'SKIN_TRIAL_ALREADY_USED', '该皮肤的免费试用已用过');
  }
  return {
    status: 'started',
    slug: skin.slug,
    entitlementKey: granted.entitlementKey,
    expiresAt: granted.expiresAt,
  };
}

export interface SkinTrialView {
  slug: string;
  entitlementKey: string;
  expiresAt: string;
}

/** 该用户全部试用记录（含已过期——客户端据此隐藏试用入口）。 */
export async function listSkinTrials(userId: string): Promise<SkinTrialView[]> {
  const rows = await getDb().skinEntitlement.findMany({
    where: { user_id: userId, entitlement_key: { startsWith: 'skin.trial.' } },
    select: { entitlement_key: true, expires_at: true },
    orderBy: { created_at: 'asc' },
  });
  return rows.flatMap((row) => {
    if (row.expires_at === null) return [];
    return [{
      slug: row.entitlement_key.slice('skin.trial.'.length),
      entitlementKey: row.entitlement_key,
      expiresAt: row.expires_at,
    }];
  });
}
