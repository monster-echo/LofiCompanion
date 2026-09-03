import { rainyStudyRoomManifest } from './rainyStudyRoom.generated';
import type { SkinManifest } from './types';

/**
 * 皮肤注册表（P2 皮肤云端化后收敛）：默认皮肤雨夜书房随包内置（安装即用、
 * 首启零下载）；其余皮肤全部由 biz-server 下发（remoteSkinsRepository 拉取
 * 后持久缓存）。解锁语义由 accessType + 服务端权益键共同决定
 * （store/domain/storeCatalog.ts），运行时选择入口在 FocusController.selectSkin。
 */

/** 内置皮肤（默认皮肤；paid 项由服务端商品行定价） */
export const BUILT_IN_SKINS: readonly SkinManifest[] = [rainyStudyRoomManifest];

/** 默认皮肤：未选择过/存量数据损坏时落回雨夜书房 */
export const DEFAULT_SKIN_MANIFEST: SkinManifest = rainyStudyRoomManifest;

/** 在给定清单（内置+远端合并视图）中按 id 或 slug 查皮肤。 */
export function findSkinManifestByIdOrSlug(
  manifests: readonly SkinManifest[],
  idOrSlug: string,
): SkinManifest | undefined {
  return (
    manifests.find((skin) => skin.id === idOrSlug) ??
    manifests.find((skin) => skin.slug === idOrSlug)
  );
}

/** 皮肤展示名：英文界面用 nameEn（skin.yaml name_en），缺省回落中文名。 */
export function skinDisplayName(
  manifest: Pick<SkinManifest, 'name' | 'nameEn'>,
  locale: 'zh-CN' | 'en-US',
): string {
  return locale === 'en-US' ? (manifest.nameEn ?? manifest.name) : manifest.name;
}
