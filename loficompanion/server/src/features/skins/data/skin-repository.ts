import { ApiError } from '@/server/http';
import { database } from '@/server/database';
import { findSkinProductBySkinId } from './product-repository';

// 皮肤目录数据访问：免费已发布皮肤列表与版本化 manifest 读取（docs/04 §3）。
// 未登录可浏览（docs/08 S14），路由层不要求 requireAuth；付费/订阅皮肤的
// manifest 按 P1-A 门禁：paid → 需 `skin.official.{slug}` 权益、premium → 需
// `catalog.premium.active`（docs/05 §4）。免费皮肤永不设门禁。

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

export async function listPublishedSkins(): Promise<SkinSummary[]> {
  const rows = await database.prepare(
    `SELECT s.id, s.slug, s.name, s.access_type, s.manifest_version,
            s.moderation_status, s.published_at, m.manifest
     FROM skins s
     LEFT JOIN skin_manifests m ON m.skin_id = s.id AND m.version = s.manifest_version
     WHERE s.published_at IS NOT NULL AND s.moderation_status = 'approved'
     ORDER BY s.created_at`,
  ).all() as Array<Record<string, unknown>>;
  return rows.map((row) => {
    let posterUrl: string | null = null;
    if (typeof row.manifest === 'string') {
      const parsed = JSON.parse(row.manifest) as { states?: Array<{ state?: string; posterUrl?: string }> };
      posterUrl = parsed.states?.find((state) => state.state === 'ready')?.posterUrl ?? null;
    }
    return {
      id: String(row.id),
      slug: String(row.slug),
      name: String(row.name),
      accessType: String(row.access_type),
      manifestVersion: Number(row.manifest_version),
      moderationStatus: String(row.moderation_status),
      publishedAt: (row.published_at as string | null) ?? null,
      posterUrl,
    };
  });
}

export async function getCurrentManifest(
  skinIdOrSlug: string,
  userId?: string,
): Promise<SkinManifestEnvelope> {
  const row = await database.prepare(
    `SELECT s.id, s.slug, s.access_type, s.manifest_version, m.manifest
     FROM skins s
     JOIN skin_manifests m ON m.skin_id = s.id AND m.version = s.manifest_version
     WHERE s.id = ? OR s.slug = ?`,
  ).get(skinIdOrSlug, skinIdOrSlug) as Record<string, unknown> | undefined;
  if (!row) {
    throw new ApiError(404, 'SKIN_NOT_ENTITLED', '皮肤不存在或未开放');
  }
  const accessType = String(row.access_type);
  if (accessType !== 'free') {
    await assertSkinEntitlement(String(row.id), String(row.slug), accessType, userId);
  }
  return {
    skinId: String(row.id),
    slug: String(row.slug),
    manifestVersion: Number(row.manifest_version),
    manifest: JSON.parse(String(row.manifest)) as Record<string, unknown>,
  };
}

// 权益门禁（docs/05 §8：未购买用户无法通过直接 API 获得付费皮肤 manifest）。
// 错误码沿用 SKIN_NOT_ENTITLED 单一码（doc 04 §5），以 status/message 区分
// 「不存在」（404）与「存在但无权益」（403）；匿名一律 401。
async function assertSkinEntitlement(
  skinId: string, slug: string, accessType: string, userId: string | undefined,
): Promise<void> {
  if (!userId) {
    throw new ApiError(401, 'UNAUTHORIZED', '请先登录后再获取付费皮肤');
  }
  const product = await findSkinProductBySkinId(skinId);
  const entitlementKey = product?.entitlementKey
    ?? (accessType === 'premium' ? 'catalog.premium.active' : `skin.official.${slug}`);
  const granted = await database.prepare(
    `SELECT 1 FROM user_entitlements
     WHERE user_id = ? AND entitlement_key = ? AND active = 1`,
  ).get(userId, entitlementKey);
  if (!granted) {
    throw new ApiError(403, 'SKIN_NOT_ENTITLED', `尚未获得皮肤权益：${entitlementKey}`);
  }
}
