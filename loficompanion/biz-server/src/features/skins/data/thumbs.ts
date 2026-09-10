import sharp from 'sharp';
import { getAppId } from '@/env';
import { getObjectBuffer, objectExists, putObjectBuffer } from './storage';
import { THUMB_WIDTH, deriveThumbKey, posterKeysOf, type ThumbReport } from './thumb-key';

// 皮肤卡片缩略图管线（发布时生成 + 管理端回填）。卡片场景（主题页/商店卡/
// 会员横滑/房间列表）用小图渲染，避免整张 1290×2796 原图下载与解码。
// key 约定与纯函数在 thumb-key.ts（node 可测）；本模块只管 sharp + 存储编排。

export { THUMB_WIDTH, deriveThumbKey, posterKeysOf } from './thumb-key';
export type { ThumbReport } from './thumb-key';

export type ThumbOutcome = 'exists' | 'generated' | 'failed';

/**
 * 确保单个 poster 的 thumb 在位（幂等）：已在位直接返回；缺失则下载原图 →
 * sharp 缩放 → 回传。任何失败返回 'failed'（不抛）——缩略图永远不阻塞发布，
 * 读取端对缺失 thumb 自动回落原图。
 */
export async function ensureSkinThumb(posterKey: string): Promise<{
  thumbKey: string | null;
  outcome: ThumbOutcome;
}> {
  // 与发布通道同级纪律：只处理本租户前缀对象（thumb 派生自 poster 同目录）
  if (!posterKey.toLowerCase().startsWith(`${getAppId().toLowerCase()}/`)) {
    return { thumbKey: null, outcome: 'failed' };
  }
  const thumbKey = deriveThumbKey(posterKey);
  if (!thumbKey) return { thumbKey: null, outcome: 'failed' };
  if (await objectExists(thumbKey)) return { thumbKey, outcome: 'exists' };
  try {
    const source = await getObjectBuffer(posterKey);
    const jpeg = await sharp(source)
      .resize({ width: THUMB_WIDTH })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
    await putObjectBuffer(thumbKey, jpeg, 'image/jpeg');
    return { thumbKey, outcome: 'generated' };
  } catch {
    // 原图缺失/存储不可达/sharp 崩了：留待下次发布或回填重试
    return { thumbKey, outcome: 'failed' };
  }
}

/** 逐个确保 manifest 全部状态 poster 的 thumb（串行：资产数少，压平峰值带宽） */
export async function ensureSkinThumbs(manifest: unknown): Promise<ThumbReport> {
  const report: ThumbReport = { generated: 0, exists: 0, failed: 0 };
  for (const posterKey of posterKeysOf(manifest)) {
    const { outcome } = await ensureSkinThumb(posterKey);
    report[outcome] += 1;
  }
  return report;
}
