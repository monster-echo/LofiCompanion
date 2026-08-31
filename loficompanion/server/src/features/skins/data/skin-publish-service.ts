import { ApiError } from '@/server/http';
import { database, runTransaction } from '@/server/database';
import { ensureBucket, signUpload } from '@/server/storage';
import type { AdminScope } from '@/server/admin-auth';
import type { SkinSummary } from './skin-repository';

/**
 * 皮肤发布服务（P0-B：免审核发新皮肤）。控制台/发布脚本经 admin 路由写入：
 * 海报先走 assets 端点直传 OSS，再携 manifest 调 publish——manifest 内
 * posterUrl 只存裸 objectKey（客户端经 /storage/urls 换签；http(s)/s3:// 形态
 * 一律拒绝，堵住租户前缀绕过）。manifest 版本只增不改（docs/04 §2）：
 * 同 (skin_id, version) 冲突即 409，绝不覆盖历史版本。
 */

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
}

export interface PublishSkinResult {
  skinId: string;
  slug: string;
  manifestVersion: number;
}

interface ManifestStateLike {
  state?: unknown;
  posterUrl?: unknown;
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
  for (const state of states as ManifestStateLike[]) {
    if (typeof state.state !== 'string' || typeof state.posterUrl !== 'string') {
      throw new ApiError(400, 'INVALID_MANIFEST', 'manifest.states[*] 需要 state 与 posterUrl');
    }
    // posterUrl 只允许裸 objectKey（http(s)/s3:// 与种子期 /skins/ 占位形态
    // 一律拒）——发布通道只收真实上传产物，且必须带本 app 租户前缀
    if (/^https?:/i.test(state.posterUrl) || /^s3:\/\//i.test(state.posterUrl)) {
      throw new ApiError(400, 'INVALID_POSTER_URL', `posterUrl 必须是裸 objectKey: ${state.posterUrl}`);
    }
    if (!state.posterUrl.startsWith('loficompanion/')) {
      throw new ApiError(
        400,
        'INVALID_POSTER_URL',
        `posterUrl 必须以租户前缀 loficompanion/ 开头: ${state.posterUrl}`,
      );
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

export async function publishSkin(
  scope: AdminScope,
  input: PublishSkinInput,
  actor: string,
): Promise<PublishSkinResult> {
  validateInput(input);
  // manifest 内的 slug/id 以服务端为准改写，客户端伪造的 id 不入库
  const now = new Date().toISOString();

  return runTransaction(async () => {
    const skinId = `skin-${input.slug}`;
    const existing = await database.prepare(
      'SELECT id, manifest_version FROM skins WHERE slug = ?',
    ).get<{ id: string; manifest_version: number }>(input.slug);
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
      await database.prepare(
        `UPDATE skins
         SET name = ?, access_type = ?, manifest_version = ?,
             moderation_status = 'approved', published_at = COALESCE(published_at, ?)
         WHERE id = ?`,
      ).run(input.name, input.accessType, version, now, skinId);
    } else {
      await database.prepare(
        `INSERT INTO skins(id, slug, name, access_type, manifest_version,
                           moderation_status, published_at, created_at)
         VALUES (?, ?, ?, ?, ?, 'approved', ?, ?)`,
      ).run(skinId, input.slug, input.name, input.accessType, version, now, now);
    }

    // 版本只增不改：同 (skin_id, version) 已存在 → 409（事务内先查后插，
    // UNIQUE(skin_id, version) 兜底并发窗口）
    const duplicate = await database.prepare(
      'SELECT 1 FROM skin_manifests WHERE skin_id = ? AND version = ?',
    ).get(skinId, version);
    if (duplicate) {
      throw new ApiError(409, 'MANIFEST_VERSION_EXISTS', `manifest 版本 ${version} 已存在，请勿并发重发`);
    }
    await database.prepare(
      `INSERT INTO skin_manifests(id, skin_id, version, manifest, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(`skin-manifest-${input.slug}-${version}`, skinId, version, manifestJson, now);

    // paid 皮肤：保底商品行（价格/权益键是门禁与商店目录的依据）
    if (input.accessType === 'paid') {
      const entitlementKey = input.entitlementKey ?? `skin.official.${input.slug}`;
      await database.prepare(
        `INSERT INTO skin_products(id, skin_id, entitlement_key, store_product_ids,
                                   price_minor, currency, status, created_at, updated_at)
         VALUES (?, ?, ?, '{}', ?, ?, 'active', ?, ?)
         ON CONFLICT (skin_id) DO UPDATE SET
           entitlement_key = excluded.entitlement_key,
           price_minor = excluded.price_minor,
           currency = excluded.currency,
           status = 'active', updated_at = excluded.updated_at`,
      ).run(
        `skin-product-${input.slug}`,
        skinId,
        entitlementKey,
        input.priceMinor ?? 0,
        input.currency ?? 'CNY',
        now,
        now,
      );
    }

    void actor;
    return { skinId, slug: input.slug, manifestVersion: version };
  });
}

/** 发布脚本 verify 用：全量清单（含未发布），带当前版本号。 */
export async function listAllSkinsForAdmin(): Promise<Array<SkinSummary & { updatedAt: string }>> {
  const rows = await database.prepare(
    `SELECT id, slug, name, access_type, manifest_version, moderation_status,
            published_at, created_at
     FROM skins ORDER BY created_at`,
  ).all() as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    accessType: String(row.access_type),
    manifestVersion: Number(row.manifest_version),
    moderationStatus: String(row.moderation_status),
    publishedAt: (row.published_at as string | null) ?? null,
    posterUrl: null,
    updatedAt: String(row.created_at),
  }));
}

// ensureBucket 供部署自检（首次发布前预热桶）；正常流程 signUpload 内部已确保。
export { ensureBucket };
