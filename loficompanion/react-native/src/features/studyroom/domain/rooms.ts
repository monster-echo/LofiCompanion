import { BUILT_IN_SKINS, findSkinManifestByIdOrSlug } from '../../skins/domain/registry';
import type { SkinManifest } from '../../skins/domain/types';
import type { Locale } from '../../../i18n/core';

/**
 * 自习室房间目录：房间 = 内置皮肤主题，id 与皮肤 slug 一致，视频画面直接
 * 复用该皮肤的 ready 态媒体。biz-server 侧孪生定义（仅 id 白名单）：
 * biz-server/src/features/studyroom/domain/rooms.ts（无共享包，id 变更需
 * 两侧同步维护）。房间名是专有名词数据，双语文案随本文件走。
 */

export type StudyRoomId = 'rainy-study-room' | 'sunny-classroom' | 'midnight-workstation';

export interface StudyRoomDef {
  readonly id: StudyRoomId;
  readonly nameZh: string;
  readonly nameEn: string;
  readonly manifest: SkinManifest;
}

const ROOM_NAME_BY_SLUG: Record<string, { zh: string; en: string }> = {
  'rainy-study-room': { zh: '雨夜书房', en: 'Rainy Study Room' },
  'sunny-classroom': { zh: '晴日教室', en: 'Sunny Classroom' },
  'midnight-workstation': { zh: '午夜工位', en: 'Midnight Workstation' },
};

/** 内置三间自习室（顺序与 BUILT_IN_SKINS 一致，首位为默认房间）。 */
export const STUDY_ROOMS: readonly StudyRoomDef[] = BUILT_IN_SKINS.flatMap((manifest) => {
  const names = ROOM_NAME_BY_SLUG[manifest.slug];
  return names
    ? [{ id: manifest.slug as StudyRoomId, nameZh: names.zh, nameEn: names.en, manifest }]
    : [];
});

/** 房间展示名（专有名词，随界面语言取用）。 */
export function roomName(def: StudyRoomDef, locale: Locale): string {
  return locale === 'en-US' ? def.nameEn : def.nameZh;
}

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
