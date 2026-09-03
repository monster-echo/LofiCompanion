import type { Locale } from '../../../i18n/core';

/**
 * 自习室房间目录：房间 = 皮肤主题，id 与皮肤 slug 一致。P2 皮肤云端化后清单
 * 不再随包内置——房间目录收敛为静态 id 白名单（与 biz-server 侧孪生定义
 * biz-server/src/features/studyroom/domain/rooms.ts 同口径），房间媒体在渲染
 * 时从皮肤注册表（focus.skins：内置默认 + 已拉取缓存的云端皮肤）解析。
 * 房间名是专有名词数据，双语文案随本文件走。
 */

export type StudyRoomId = 'rainy-study-room' | 'sunny-classroom' | 'midnight-workstation';

export interface StudyRoomDef {
  readonly id: StudyRoomId;
  readonly nameZh: string;
  readonly nameEn: string;
}

/** 三间自习室（顺序即列表顺序，首位为默认房间）。 */
export const STUDY_ROOMS: readonly StudyRoomDef[] = [
  { id: 'rainy-study-room', nameZh: '雨夜书房', nameEn: 'Rainy Study Room' },
  { id: 'sunny-classroom', nameZh: '晴日教室', nameEn: 'Sunny Classroom' },
  { id: 'midnight-workstation', nameZh: '午夜工位', nameEn: 'Midnight Workstation' },
];

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
