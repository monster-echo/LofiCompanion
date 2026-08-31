import { BUILT_IN_SKINS, findSkinManifestByIdOrSlug } from '../../skins/domain/registry';
import type { SkinManifest } from '../../skins/domain/types';

/**
 * 自习室房间目录：房间 = 内置皮肤主题，id 与皮肤 slug 一致，视频画面直接
 * 复用该皮肤的 ready 态媒体。biz-server 侧孪生定义：
 * biz-server/src/features/studyroom/domain/rooms.ts（无共享包，两侧同步维护）。
 */

export type StudyRoomId = 'rainy-study-room' | 'sunny-classroom' | 'midnight-workstation';

export interface StudyRoomDef {
  readonly id: StudyRoomId;
  readonly name: string;
  readonly manifest: SkinManifest;
}

const ROOM_NAME_BY_SLUG: Record<string, string> = {
  'rainy-study-room': '雨夜书房',
  'sunny-classroom': '晴日教室',
  'midnight-workstation': '午夜工位',
};

/** 内置三间自习室（顺序与 BUILT_IN_SKINS 一致，首位为默认房间）。 */
export const STUDY_ROOMS: readonly StudyRoomDef[] = BUILT_IN_SKINS.flatMap((manifest) => {
  const name = ROOM_NAME_BY_SLUG[manifest.slug];
  return name ? [{ id: manifest.slug as StudyRoomId, name, manifest }] : [];
});

/** 按 id 取房间；未知 id（服务端目录先行/数据异常）落回默认房间。 */
export function roomForId(id: string): StudyRoomDef {
  return (
    STUDY_ROOMS.find((room) => room.id === id) ?? (STUDY_ROOMS[0] as StudyRoomDef)
  );
}

/** id 白名单校验（与 biz-server isStudyRoomId 同口径）。 */
export function isStudyRoomId(value: unknown): value is StudyRoomId {
  return typeof value === 'string' && STUDY_ROOMS.some((room) => room.id === value);
}

export function defaultRoomId(): StudyRoomId {
  return (STUDY_ROOMS[0] as StudyRoomDef).id;
}

/** 换房/协议解析共用的清单查询（ manifest 缺失时返回 undefined）。 */
export function findRoomManifest(idOrSlug: string): SkinManifest | undefined {
  return findSkinManifestByIdOrSlug(BUILT_IN_SKINS, idOrSlug);
}
