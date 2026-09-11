import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { getDb } from '@/db';

// 皮肤权益（P4 起所有权数据归 biz）：skin.official.{slug} 键在此发放与查询。
// 皮肤为非消耗型买断——expires_at 恒 null（保留列对齐通用权益形态）；
// 退款撤销置 active=false。UNIQUE(user_id, entitlement_key) 保证幂等。
//
// 试用键（skin.trial.{slug}）复用本表（expires_at 承载 24h 窗口，无新迁移）：
// 「拥有键集」与「可用键集」必须分叉——试用键绝不进拥有键集（否则商店会把
// 试用中皮肤显示成已拥有），只在门禁/清单下载的可用性判定里生效。

/** 拥有键集的前缀过滤（试用键一次性发放后行永久存在，必须挡在目录之外）。 */
const TRIAL_KEY_PREFIX = 'skin.trial.';

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

/** 已拥有皮肤权益键（商店/画廊/快切判拥有；未拥有返回空集）。试用键绝不进此集。 */
export async function listActiveSkinEntitlementKeys(userId: string): Promise<string[]> {
  const rows = await getDb().skinEntitlement.findMany({
    where: {
      user_id: userId,
      active: true,
      entitlement_key: { not: { startsWith: TRIAL_KEY_PREFIX } },
    },
    select: { entitlement_key: true },
  });
  return rows.map((row) => row.entitlement_key);
}

/** 试用键在窗口内是否可用（纯函数，node 可测）：过期/不可解析一律不可用。 */
export function isUsableTrial(expiresAt: string | null, nowIso: string): boolean {
  if (expiresAt === null) return false;
  const expiresMs = Date.parse(expiresAt);
  return !Number.isNaN(expiresMs) && expiresMs > Date.parse(nowIso);
}

/**
 * 可用键集（manifest 门禁专用）：拥有键 + 窗口内试用键。门禁语义是「现在能
 * 不能下载/使用」，与「是否拥有」分离——试用用户可拉付费清单但不显示已拥有。
 */
export async function listUsableSkinEntitlementKeys(
  userId: string,
  nowIso: string,
): Promise<string[]> {
  const rows = await getDb().skinEntitlement.findMany({
    where: { user_id: userId, active: true },
    select: { entitlement_key: true, expires_at: true },
  });
  return rows
    .filter((row) => row.entitlement_key.startsWith(TRIAL_KEY_PREFIX)
      ? isUsableTrial(row.expires_at, nowIso)
      : true)
    .map((row) => row.entitlement_key);
}

/**
 * manifest 门禁的键匹配（纯函数，node 可测）：paid 放行正式键（购买）或
 * 窗口内试用键（listUsable 已滤过期试用）；premium 只认会员键；free 恒放行
 * （门禁调用方已先分流）。回归背景（2026-09-11）：试用发放 skin.trial.{slug}、
 * 门禁只比 skin.official.{slug}——字面不等导致试用用户拉清单 403、详情页
 * 「下载资源包并使用」秒失败变「下载失败，点击重试」死局。
 */
export function manifestEntitlementSatisfied(input: {
  accessType: string;
  slug: string;
  keys: readonly string[];
}): boolean {
  if (input.accessType === 'premium') {
    return input.keys.includes('catalog.premium.active');
  }
  if (input.accessType === 'paid') {
    return input.keys.includes(`skin.official.${input.slug}`)
      || input.keys.includes(`${TRIAL_KEY_PREFIX}${input.slug}`);
  }
  return true;
}

/**
 * 发放试用权益（一次性）：行已存在（无论是否过期）直接返回既存行，不重置
 * 窗口——「每皮肤限试一次」由 UNIQUE(user_id, entitlement_key) 行的存在性
 * 表达。窗口过期后由调用方（trial-service）拒绝复用。
 */
export async function grantSkinTrialEntitlement(input: {
  userId: string;
  slug: string;
  nowIso: string;
  ttlHours: number;
}): Promise<{ entitlementKey: string; expiresAt: string; created: boolean }> {
  const entitlementKey = `${TRIAL_KEY_PREFIX}${input.slug}`;
  const expiresAt = new Date(
    Date.parse(input.nowIso) + input.ttlHours * 3600_000,
  ).toISOString();
  const existing = await getDb().skinEntitlement.findUnique({
    where: { user_id_entitlement_key: { user_id: input.userId, entitlement_key: entitlementKey } },
  });
  if (existing) {
    return { entitlementKey, expiresAt: existing.expires_at ?? expiresAt, created: false };
  }
  try {
    await getDb().skinEntitlement.create({
      data: {
        id: randomUUID(),
        user_id: input.userId,
        entitlement_key: entitlementKey,
        source_order_id: `trial-${randomUUID()}`,
        active: true,
        expires_at: expiresAt,
        created_at: input.nowIso,
      },
    });
  } catch (error) {
    // 并发窗口 UNIQUE 兜底：另一请求已发放 → 读回既存行（一次性语义不变）
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const raced = await getDb().skinEntitlement.findUnique({
        where: { user_id_entitlement_key: { user_id: input.userId, entitlement_key: entitlementKey } },
      });
      if (raced) {
        return { entitlementKey, expiresAt: raced.expires_at ?? expiresAt, created: false };
      }
    }
    throw error;
  }
  return { entitlementKey, expiresAt, created: true };
}
