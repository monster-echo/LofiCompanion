import type { NextRequest } from 'next/server';
import { handleError, ok } from '@/lib/http';
import { adminContext } from '@/lib/admin-auth';
import { getDb } from '@/db';
import { ensureSkinThumbs, posterKeysOf, type ThumbReport } from '@/features/skins/data/thumbs';

// POST /api/v1/admin/skins/thumbs —— 卡片缩略图回填：为全部已发布皮肤当前
// manifest 的每个 poster 生成缺失的 .thumb.jpg（幂等，已在位直接跳过）。
// 发布管线（publishSkin）已内置生成；本端点服务两件事：
//   1. 存量皮肤一次性补齐（缩略图管线上线前发布的皮肤）
//   2. 发布时生成失败（原图缺失后补传等）的补拉
// 鉴权 = x-biz-key（BIZ_ADMIN_KEY）。返回逐皮肤报告，failed>0 时管理员按
// slug 排查原图在位情况。耗时随皮肤数线性（每张原图下载+缩放+回传）。
export async function POST(_request: NextRequest) {
  try {
    await adminContext(_request);
    const db = getDb();
    const skins = await db.skin.findMany({
      where: { published_at: { not: null }, moderation_status: 'approved' },
      orderBy: { created_at: 'asc' },
    });
    const manifests = await db.skinManifest.findMany({
      where: { skin_id: { in: skins.map((skin) => skin.id) } },
      select: { skin_id: true, version: true, manifest: true },
    });
    const currentManifestBySkin = new Map(
      manifests
        .filter((row) => row.version === skins.find((skin) => skin.id === row.skin_id)?.manifest_version)
        .map((row) => [row.skin_id, row.manifest]),
    );
    const perSkin: Array<{ slug: string; posters: number } & ThumbReport> = [];
    const total: ThumbReport = { generated: 0, exists: 0, failed: 0 };
    for (const skin of skins) {
      const manifestJson = currentManifestBySkin.get(skin.id);
      if (typeof manifestJson !== 'string') continue;
      let manifest: unknown;
      try {
        manifest = JSON.parse(manifestJson);
      } catch {
        continue;
      }
      const posters = posterKeysOf(manifest).length;
      if (posters === 0) continue;
      const report = await ensureSkinThumbs(manifest);
      perSkin.push({ slug: skin.slug, posters, ...report });
      total.generated += report.generated;
      total.exists += report.exists;
      total.failed += report.failed;
    }
    return ok({ skins: perSkin.length, total, perSkin });
  } catch (error) {
    return handleError(error);
  }
}
