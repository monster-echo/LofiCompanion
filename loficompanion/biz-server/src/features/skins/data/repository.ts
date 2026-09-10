import { Prisma } from '@prisma/client';
// ApiError 取独立模块（http.ts 顶层 import next/server——node 测试/WS 导入链
// 不能加载任何 Next API，见 apiError.ts 头注释）
import { ApiError } from '@/lib/apiError';
import { getDb } from '@/db';
import { getAppId } from '@/env';
import type { AdminScope } from '@/lib/admin-auth';
import { signUpload } from './storage';
import { ensureSkinThumbs } from './thumbs';
import { upsertSkinProduct } from '@/features/store/data/product-repository';
import { listUsableSkinEntitlementKeys } from '@/features/store/data/entitlement-service';
import { fetchMembershipEntitlementKeys } from '@/features/store/data/membership-client';

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

// 公开营销资产（GET /api/v1/skins/{id}/poster 与 /video 用）：已发布且过审
// 皮肤的指定状态 poster/video objectKey。objectKey 本就随公开目录/manifest
// 下发，属营销资产，不走权益门禁；仅限已发布皮肤，未发布/未过审一律 null
// （404）。海报按态缺失回落 ready（客户端四态预览全兜底）；视频不回落——
// 无该态视频就 404，客户端退回海报。
export async function getPublishedSkinStateAsset(
  skinIdOrSlug: string,
  state: string | null,
  field: 'posterUrl' | 'videoUrl',
): Promise<string | null> {
  const db = getDb();
  const skin = await db.skin.findFirst({
    where: {
      OR: [{ id: skinIdOrSlug }, { slug: skinIdOrSlug }],
      published_at: { not: null },
      moderation_status: 'approved',
    },
  });
  if (!skin) return null;
  const manifest = await db.skinManifest.findUnique({
    where: { skin_id_version: { skin_id: skin.id, version: skin.manifest_version } },
  });
  if (!manifest || typeof manifest.manifest !== 'string') return null;
  const parsed = JSON.parse(manifest.manifest) as {
    states?: Array<Record<string, unknown>>;
  };
  const keyOf = (entry: Record<string, unknown>): string | null =>
    typeof entry[field] === 'string' && entry[field].length > 0 ? (entry[field] as string) : null;
  const requested = state === null ? null : parsed.states?.find((entry) => entry.state === state);
  const rawKey =
    (requested !== undefined && requested !== null ? keyOf(requested) : null)
    // 海报回落 ready：请求态不存在/该态无海报时保证有图可显
    ?? (field === 'posterUrl'
      ? parsed.states?.find((entry) => entry.state === 'ready')?.posterUrl ?? null
      : null);
  if (typeof rawKey !== 'string') return null;
  if (!rawKey || /^https?:/i.test(rawKey) || /^s3:\/\//i.test(rawKey)) return null;
  // 与发布通道同级纪律：只签本租户前缀对象（堵租户前缀绕过）
  if (!rawKey.toLowerCase().startsWith(`${getAppId().toLowerCase()}/`)) return null;
  return rawKey;
}

/** ready 态海报（目录/卡片兜底的历史入口，行为不变）。 */
export async function getPublishedSkinPoster(skinIdOrSlug: string): Promise<string | null> {
  return getPublishedSkinStateAsset(skinIdOrSlug, 'ready', 'posterUrl');
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
  // P4 商店域迁入：paid 的所有权数据在本地 skin_entitlements（可用键集 =
  // 拥有键 + 窗口内试用键——试用用户可拉清单，商店「已拥有」语义不含试用）；
  // premium 是会员域权益，仍转发 auth 查询。
  const keys = accessType === 'paid'
    ? await listUsableSkinEntitlementKeys(auth.userId, new Date().toISOString())
    : await fetchMembershipEntitlementKeys(auth.authorization);
  if (!keys.includes(entitlementKey)) {
    throw new ApiError(403, 'SKIN_NOT_ENTITLED', `尚未获得皮肤权益：${entitlementKey}`);
  }
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
  /** 平台商店 SKU 映射（apple/google/hms/plusApple/plusGoogle）；upsert 未提供时保留现值 */
  storeProductIds?: Record<string, string>;
  /** 限时发售窗口（ISO）；undefined=保留现值、null=显式清除 */
  availableFrom?: string | null;
  availableUntil?: string | null;
  /** Plus 会员价（分）；仅 paid、必须 < priceMinor；null=清除折扣 */
  plusPriceMinor?: number | null;
}

export interface PublishSkinResult {
  skinId: string;
  slug: string;
  manifestVersion: number;
  /** 卡片缩略图生成结果（best-effort；failed>0 可经管理端回填补齐） */
  thumbs: { generated: number; exists: number; failed: number };
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
  validateAvailabilityWindow(input);
}

/**
 * 限时窗口与 Plus 会员价纪律（纯函数，node 可测）：
 *  - availableFrom/availableUntil 必须可解析为 ISO 时间，且 from < until；
 *  - plusPriceMinor 仅 paid 有效（free/premium 携带即拒），且必须 < priceMinor
 *    （折扣 SKU 无意义/倒挂都会造成显示价与扣款价错位）。
 */
export function validateAvailabilityWindow(input: {
  accessType: string;
  priceMinor?: number;
  availableFrom?: string | null;
  availableUntil?: string | null;
  plusPriceMinor?: number | null;
}): void {
  if (input.availableFrom != null || input.availableUntil != null) {
    const fromMs = input.availableFrom != null ? Date.parse(input.availableFrom) : null;
    const untilMs = input.availableUntil != null ? Date.parse(input.availableUntil) : null;
    if (input.availableFrom != null && Number.isNaN(fromMs)) {
      throw new ApiError(400, 'INVALID_AVAILABILITY', `availableFrom 不是可解析的 ISO 时间: ${input.availableFrom}`);
    }
    if (input.availableUntil != null && Number.isNaN(untilMs)) {
      throw new ApiError(400, 'INVALID_AVAILABILITY', `availableUntil 不是可解析的 ISO 时间: ${input.availableUntil}`);
    }
    if (fromMs !== null && untilMs !== null && fromMs >= untilMs) {
      throw new ApiError(400, 'INVALID_AVAILABILITY', 'availableFrom 必须早于 availableUntil');
    }
  }
  if (input.plusPriceMinor != null) {
    if (input.accessType !== 'paid') {
      throw new ApiError(400, 'INVALID_AVAILABILITY', 'plusPriceMinor 仅 paid 皮肤有效');
    }
    if (input.plusPriceMinor <= 0 || input.plusPriceMinor >= (input.priceMinor ?? 0)) {
      throw new ApiError(400, 'INVALID_AVAILABILITY', 'plusPriceMinor 必须为正且小于 priceMinor');
    }
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
    ...(input.availableFrom !== undefined ? { availableFrom: input.availableFrom } : {}),
    ...(input.availableUntil !== undefined ? { availableUntil: input.availableUntil } : {}),
    ...(input.plusPriceMinor !== undefined ? { plusPriceMinor: input.plusPriceMinor } : {}),
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
  let result: Omit<PublishSkinResult, 'thumbs'>;
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

  // 卡片缩略图（best-effort）：事务提交后逐状态生成 .thumb.jpg。失败不回滚
  // 发布（读取端缺 thumb 自动回落原图，可经 POST /admin/skins/thumbs 回填）。
  const thumbs = await ensureSkinThumbs(input.manifest);

  void actor;
  return { ...result, thumbs };
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
