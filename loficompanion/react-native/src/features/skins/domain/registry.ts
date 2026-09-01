import { midnightWorkstationManifest } from './midnightWorkstation.generated';
import { rainyStudyRoomManifest } from './rainyStudyRoom.generated';
import { sunnyClassroomManifest } from './sunnyClassroom.generated';
import type { SkinManifest } from './types';

/**
 * 内置皮肤注册表（P1 皮肤扩展）。包内分发全部清单，随包零下载；
 * 解锁语义由 accessType + 服务端权益键共同决定（store/domain/storeCatalog.ts），
 * 运行时选择入口在 FocusController.selectSkin。
 */

/** 内置皮肤（首位为默认皮肤，免费区/列表排序依赖此顺序） */
export const BUILT_IN_SKINS: readonly SkinManifest[] = [
  rainyStudyRoomManifest,
  sunnyClassroomManifest,
  midnightWorkstationManifest,
];

/** 默认皮肤：未选择过/存量数据损坏时落回雨夜书房 */
export const DEFAULT_SKIN_MANIFEST: SkinManifest = rainyStudyRoomManifest;

/** 按 manifest id 或 slug 查内置皮肤（选择仓储存 id；商店路由带 slug）。 */
export function findSkinManifest(idOrSlug: string): SkinManifest | undefined {
  return findSkinManifestByIdOrSlug(BUILT_IN_SKINS, idOrSlug);
}

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
