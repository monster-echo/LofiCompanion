import { findSkinManifestByIdOrSlug } from '../../skins/domain/registry';
import { stateAsset } from '../../skins/domain/resolve';
import type { SkinManifest } from '../../skins/domain/types';
import type { CompanionState } from '../../skins/domain/types';

/**
 * 商店海报查找（P1-A Task 3；P2 皮肤云端化后从皮肤注册表解析）。注册表 =
 * 内置默认皮肤（require number）+ 已拉取缓存的云端皮肤（本地缓存文件 uri，
 * RN Image 原生支持）；未拉取/目录外的皮肤返回 null，由 UI 渲染主题化占位
 * （不使用虚构截图）。非 Metro 环境内置 poster 为 0，同样按缺失处理。
 */

/** S15 四态切换（doc-08 §16：ready/focus/drink/complete） */
export const DETAIL_PREVIEW_STATES: readonly CompanionState[] = [
  'ready',
  'focusing',
  'drinking',
  'completed',
];

export function storePoster(
  skins: readonly SkinManifest[],
  slug: string,
  state: CompanionState,
): number | { readonly uri: string } | null {
  const manifest = findSkinManifestByIdOrSlug(skins, slug);
  if (!manifest) return null;
  try {
    const poster = stateAsset(manifest, state).poster;
    if (typeof poster === 'number') return poster || null;
    return poster;
  } catch {
    return null;
  }
}
