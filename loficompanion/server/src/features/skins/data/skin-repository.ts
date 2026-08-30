import { ApiError } from '@/server/http';
import { database } from '@/server/database';

// 皮肤目录数据访问：免费已发布皮肤列表与版本化 manifest 读取（docs/04 §3）。
// 未登录可浏览（docs/08 S14），路由层不要求 requireAuth；付费/订阅权益门禁
// 在 P1-A 接入 manifest 权限检查。

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

export async function getCurrentManifest(skinIdOrSlug: string): Promise<SkinManifestEnvelope> {
  const row = await database.prepare(
    `SELECT s.id, s.slug, s.manifest_version, m.manifest
     FROM skins s
     JOIN skin_manifests m ON m.skin_id = s.id AND m.version = s.manifest_version
     WHERE s.id = ? OR s.slug = ?`,
  ).get(skinIdOrSlug, skinIdOrSlug) as Record<string, unknown> | undefined;
  if (!row) {
    throw new ApiError(404, 'SKIN_NOT_ENTITLED', '皮肤不存在或未开放');
  }
  return {
    skinId: String(row.id),
    slug: String(row.slug),
    manifestVersion: Number(row.manifest_version),
    manifest: JSON.parse(String(row.manifest)) as Record<string, unknown>,
  };
}
