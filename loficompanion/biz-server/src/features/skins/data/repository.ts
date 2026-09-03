import { Prisma } from '@prisma/client';
import { ApiError } from '@/lib/http';
import { getDb } from '@/db';
import { AUTH_BASE_URL, getAppId } from '@/env';
import type { AdminScope } from '@/lib/admin-auth';
import { signUpload } from './storage';
import { upsertSkinProduct } from '@/features/store/data/product-repository';
import { listActiveSkinEntitlementKeys } from '@/features/store/data/entitlement-service';

// 皮肤目录数据访问 + 发布服务（Prisma 搬迁自 loficompanion/server
// skin-repository / skin-publish-service，docs/04 §3、P0-B/P1-A）：
// - 目录未登录可浏览（docs/08 S14），路由层不要求鉴权；付费/订阅皮肤的
//   manifest 按 P1-A 门禁：paid → 需 `skin.official.{slug}` 权益、premium →
//   需 `catalog.premium.active`（docs/05 §4）。免费皮肤永不设门禁。
//   P4 皮肤商店迁入后门禁本地化：paid 查本地 skin_entitlements（所有权数据
//   归 biz）；premium 仍转发用户 Bearer 到 auth /membership/entitlements
//  （Plus 是基础设施会员域）。
// - 发布：manifest 版本只增不改（docs/04 §2），同 (skin_id, version) 冲突即
//   409；manifest 内 id/slug/name/accessType/manifestVersion 服务端盖章；
//   posterUrl 只收裸 objectKey 且必须带本 app 租户前缀（堵租户前缀绕过）。
//   paid 皮肤发布成功后本地 upsert 商品行（商店域已随 P4 迁入 biz）。

export interface SkinSummary {
  id: string;
  slug: string;
  name: string;
  accessType: string;
  manifestVersion: number;
  moderationStatus: string;
  publishedAt: string | null;
  posterUrl: string | null;
}

export interface SkinManifestEnvelope {
  skinId: string;
  slug: string;
  manifestVersion: number;
  manifest: Record<string, unknown>;
}

/** 门禁所需的最小调用方身份（token 已验签；authorization 原头转发 auth 用）。 */
export interface ViewerAuth {
  userId: string;
  authorization: string;
}

export async function listPublishedSkins(): Promise<SkinSummary[]> {
  const db = getDb();
  const skins = await db.skin.findMany({
    where: { published_at: { not: null }, moderation_status: 'approved' },
    orderBy: { created_at: 'asc' },
  });
  if (skins.length === 0) return [];
  const manifests = await db.skinManifest.findMany({
    where: { skin_id: { in: skins.map((skin) => skin.id) } },
    select: { skin_id: true, version: true, manifest: true },
  });
  const currentVersionBySkin = new Map(skins.map((skin) => [skin.id, skin.manifest_version]));
  const currentManifestBySkin = new Map(
    manifests
      .filter((row) => row.version === currentVersionBySkin.get(row.skin_id))
      .map((row) => [row.skin_id, row.manifest]),
  );
  return skins.map((skin) => {
    let posterUrl: string | null = null;
    const manifestJson = currentManifestBySkin.get(skin.id);
    if (typeof manifestJson === 'string') {
      const parsed = JSON.parse(manifestJson) as { states?: Array<{ state?: string; posterUrl?: string }> };
      posterUrl = parsed.states?.find((state) => state.state === 'ready')?.posterUrl ?? null;
    }
    return {
      id: skin.id,
      slug: skin.slug,
      name: skin.name,
      accessType: skin.access_type,
      manifestVersion: skin.manifest_version,
      moderationStatus: skin.moderation_status,
      publishedAt: skin.published_at ?? null,
      posterUrl,
    };
  });
}

export async function getCurrentManifest(
  skinIdOrSlug: string,
  auth: ViewerAuth | null,
): Promise<SkinManifestEnvelope> {
  const db = getDb();
  const skin = await db.skin.findFirst({
    where: { OR: [{ id: skinIdOrSlug }, { slug: skinIdOrSlug }] },
  });
  if (!skin) {
    throw new ApiError(404, 'SKIN_NOT_ENTITLED', '皮肤不存在或未开放');
  }
  const manifest = await db.skinManifest.findUnique({
    where: { skin_id_version: { skin_id: skin.id, version: skin.manifest_version } },
  });
  if (!manifest) {
    throw new ApiError(404, 'SKIN_NOT_ENTITLED', '皮肤不存在或未开放');
  }
  if (skin.access_type !== 'free') {
    await assertSkinEntitlement(skin.slug, skin.access_type, auth);
  }

  return {
    skinId: skin.id,
    slug: skin.slug,
    manifestVersion: skin.manifest_version,
    manifest: JSON.parse(manifest.manifest) as Record<string, unknown>,
  };
}

// 权益门禁（docs/05 §8：未购买用户无法通过直接 API 获得付费皮肤 manifest）。
// 错误码沿用 SKIN_NOT_ENTITLED 单一码（doc 04 §5），以 status/message 区分
// 「不存在」（404）与「存在但无权益」（403）；匿名/无效 token 一律 401。
async function assertSkinEntitlement(
  slug: string,
  accessType: string,
  auth: ViewerAuth | null,
): Promise<void> {
  if (!auth) {
    throw new ApiError(401, 'UNAUTHORIZED', '请先登录后再获取付费皮肤');
  }
  // 确定性权益键约定：paid → skin.official.{slug}；premium → catalog.premium.active。
  const entitlementKey = accessType === 'premium'
    ? 'catalog.premium.active'
    : `skin.official.${slug}`;
  // P4 商店域迁入：paid 的所有权数据在本地 skin_entitlements；premium 是会员
  // 域权益，仍转发 auth 查询。
  const keys = accessType === 'paid'
    ? await listActiveSkinEntitlementKeys(auth.userId)
    : await fetchUserEntitlementKeys(auth.authorization);
  if (!keys.includes(entitlementKey)) {
    throw new ApiError(403, 'SKIN_NOT_ENTITLED', `尚未获得皮肤权益：${entitlementKey}`);
  }
}

/** 转发用户 Bearer 到 auth 权益查询（aud=JWT_AUDIENCE 的用户 token 原样转发）。 */
async function fetchUserEntitlementKeys(authorization: string): Promise<string[]> {
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

// ── 发布服务（原 skin-publish-service）────────────────────────────────────

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;

export interface PublishSkinInput {
  slug: string;
  name: string;
  accessType: 'free' | 'paid' | 'premium';
  manifest: Record<string, unknown>;
  /** paid 皮肤商品价（分）；paid 必填 */
  priceMinor?: number;
  currency?: string;
  /** paid 权益键；缺省 `skin.official.{slug}`（与门禁回退逻辑一致） */
  entitlementKey?: string;
  /** 支付启用标识（auth 商品行）：'mock'=模拟支付；'store'=原生商店 IAP
   *  （真实适配器由 auth verify 按客户端平台分流）；缺省 mock */
  provider?: 'mock' | 'store' | 'apple' | 'google' | 'hms';
  /** 平台商店 SKU 映射（apple/google/hms）；auth upsert 未提供时保留现值 */
  storeProductIds?: Record<string, string>;
}

export interface PublishSkinResult {
  skinId: string;
  slug: string;
  manifestVersion: number;
}

interface ManifestStateLike {
  state?: unknown;
  posterUrl?: unknown;
  videoUrl?: unknown;
  focalPointX?: unknown;
  focalPointY?: unknown;
  durationMs?: unknown;
}

/** 结构校验（路由层 zod 已管外层形状；这里管业务纪律） */
function validateInput(input: PublishSkinInput): void {
  if (!SLUG_PATTERN.test(input.slug)) {
    throw new ApiError(400, 'INVALID_SLUG', `slug 只能是小写字母/数字/短横（2–64 位）: ${input.slug}`);
  }
  const manifest = input.manifest;
  const states = (manifest as { states?: unknown }).states;
  if (!Array.isArray(states) || states.length === 0) {
    throw new ApiError(400, 'INVALID_MANIFEST', 'manifest.states 至少需要一个状态条目');
  }
  // posterUrl 只允许裸 objectKey（http(s)/s3:// 形态一律拒）——发布通道只收
  // 真实上传产物，且必须带本 app 租户前缀（appId 小写，与 storage 签发的
  // key 前缀一致）。
  const tenantPrefix = `${getAppId().toLowerCase()}/`;
  for (const state of states as ManifestStateLike[]) {
    if (typeof state.state !== 'string' || typeof state.posterUrl !== 'string') {
      throw new ApiError(400, 'INVALID_MANIFEST', 'manifest.states[*] 需要 state 与 posterUrl');
    }
    if (/^https?:/i.test(state.posterUrl) || /^s3:\/\//i.test(state.posterUrl)) {
      throw new ApiError(400, 'INVALID_POSTER_URL', `posterUrl 必须是裸 objectKey: ${state.posterUrl}`);
    }
    if (!state.posterUrl.toLowerCase().startsWith(tenantPrefix)) {
      throw new ApiError(
        400,
        'INVALID_POSTER_URL',
        `posterUrl 必须以租户前缀 ${tenantPrefix} 开头: ${state.posterUrl}`,
      );
    }
    // videoUrl 可选（纯海报状态合法）；携带时与 posterUrl 同纪律：裸 objectKey
    // + 本 app 租户前缀（发布脚本直传视频后改写为完整 key）。
    if (state.videoUrl !== undefined) {
      if (typeof state.videoUrl !== 'string' || state.videoUrl.length === 0) {
        throw new ApiError(400, 'INVALID_MANIFEST', 'manifest.states[*].videoUrl 必须是非空字符串');
      }
      if (/^https?:/i.test(state.videoUrl) || /^s3:\/\//i.test(state.videoUrl)) {
        throw new ApiError(400, 'INVALID_POSTER_URL', `videoUrl 必须是裸 objectKey: ${state.videoUrl}`);
      }
      if (!state.videoUrl.toLowerCase().startsWith(tenantPrefix)) {
        throw new ApiError(
          400,
          'INVALID_POSTER_URL',
          `videoUrl 必须以租户前缀 ${tenantPrefix} 开头: ${state.videoUrl}`,
        );
      }
    }
    if (
      typeof state.focalPointX !== 'number' ||
      typeof state.focalPointY !== 'number' ||
      typeof state.durationMs !== 'number'
    ) {
      throw new ApiError(400, 'INVALID_MANIFEST', 'manifest.states[*] 需要 focalPointX/Y 与 durationMs');
    }
  }
  if ((manifest as { defaultState?: unknown }).defaultState === undefined) {
    throw new ApiError(400, 'INVALID_MANIFEST', 'manifest 需要 defaultState');
  }
  if ((manifest as { themeTokens?: unknown }).themeTokens === undefined) {
    throw new ApiError(400, 'INVALID_MANIFEST', 'manifest 需要 themeTokens');
  }
  if (input.accessType === 'paid' && (input.priceMinor ?? 0) <= 0) {
    throw new ApiError(400, 'INVALID_PRICE', 'paid 皮肤必须提供正的 priceMinor（分）');
  }
}

/** 海报直传：发布脚本先调这个拿 presigned PUT（admin 作用域的租户/环境前缀）。 */
export async function signSkinAssetUpload(
  scope: AdminScope,
  input: { path: string; contentType: string },
) {
  if (!/^[a-zA-Z0-9._\-/]+$/.test(input.path)) {
    throw new ApiError(400, 'INVALID_PATH', 'path 只能含字母、数字、点、短横、斜杠');
  }
  return signUpload({
    appId: scope.appId,
    environment: scope.environment,
    path: input.path,
    contentType: input.contentType,
  });
}

/** paid 皮肤商品行登记（P4 起商店域在 biz：本地 upsert，不再远调 auth）。 */
async function registerPaidProduct(
  skinId: string,
  input: PublishSkinInput,
): Promise<void> {
  await upsertSkinProduct({
    skinId,
    slug: input.slug,
    skinName: input.name,
    accessType: 'paid',
    entitlementKey: input.entitlementKey ?? `skin.official.${input.slug}`,
    priceMinor: input.priceMinor ?? 0,
    currency: input.currency ?? 'USD',
    ...(input.provider !== undefined ? { provider: input.provider } : {}),
    ...(input.storeProductIds !== undefined
      ? { storeProductIds: input.storeProductIds }
      : {}),
  });
}

export async function publishSkin(
  scope: AdminScope,
  input: PublishSkinInput,
  actor: string,
): Promise<PublishSkinResult> {
  validateInput(input);
  void scope;
  // manifest 内的 slug/id 以服务端为准改写，客户端伪造的 id 不入库
  const now = new Date().toISOString();
  let result: PublishSkinResult;
  try {
    result = await getDb().$transaction(async (tx) => {
      const skinId = `skin-${input.slug}`;
      const existing = await tx.skin.findUnique({ where: { slug: input.slug } });
      const version = (existing?.manifest_version ?? 0) + 1;

      // manifest 归一化：id/slug/name/accessType/manifestVersion 由服务端盖章
      const manifestJson = JSON.stringify({
        ...input.manifest,
        id: `${input.slug}-v${version}`,
        slug: input.slug,
        name: input.name,
        accessType: input.accessType,
        manifestVersion: version,
      });

      if (existing) {
        await tx.skin.update({
          where: { id: skinId },
          data: {
            name: input.name,
            access_type: input.accessType,
            manifest_version: version,
            moderation_status: 'approved',
            published_at: existing.published_at ?? now, // COALESCE(published_at, ?)
          },
        });
      } else {
        await tx.skin.create({
          data: {
            id: skinId,
            slug: input.slug,
            name: input.name,
            access_type: input.accessType,
            manifest_version: version,
            moderation_status: 'approved',
            published_at: now,
            created_at: now,
          },
        });
      }

      // 版本只增不改：同 (skin_id, version) 已存在 → 409（事务内先查后插，
      // UNIQUE(skin_id, version) 兜底并发窗口）
      const duplicate = await tx.skinManifest.findUnique({
        where: { skin_id_version: { skin_id: skinId, version } },
        select: { id: true },
      });
      if (duplicate) {
        throw new ApiError(409, 'MANIFEST_VERSION_EXISTS', `manifest 版本 ${version} 已存在，请勿并发重发`);
      }
      await tx.skinManifest.create({
        data: {
          id: `skin-manifest-${input.slug}-${version}`,
          skin_id: skinId,
          version,
          manifest: manifestJson,
          created_at: now,
        },
      });
      return { skinId, slug: input.slug, manifestVersion: version };
    });
  } catch (error) {
    // UNIQUE(skin_id, version) 并发兜底：与显式 duplicate 检查同语义
    if (
      error instanceof Prisma.PrismaClientKnownRequestError
      && error.code === 'P2002'
      && Array.isArray(error.meta?.target)
      && (error.meta?.target as string[]).includes('version')
    ) {
      throw new ApiError(409, 'MANIFEST_VERSION_EXISTS', 'manifest 版本已存在，请勿并发重发');
    }
    throw error;
  }

  // paid 皮肤：保底商品行（价格/权益键是门禁与商店目录的依据）。发布事务已
  // 提交——登记失败不影响已发布的皮肤，客户端重试发布即重登记（bump 版本）。
  if (input.accessType === 'paid') {
    await registerPaidProduct(result.skinId, input);
  }

  void actor;
  return result;
}

/** 发布脚本 verify 用：全量清单（含未发布），带当前版本号。 */
export async function listAllSkinsForAdmin(): Promise<Array<SkinSummary & { updatedAt: string }>> {
  const rows = await getDb().skin.findMany({ orderBy: { created_at: 'asc' } });
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    accessType: row.access_type,
    manifestVersion: row.manifest_version,
    moderationStatus: row.moderation_status,
    publishedAt: row.published_at ?? null,
    posterUrl: null,
    updatedAt: row.created_at,
  }));
}
