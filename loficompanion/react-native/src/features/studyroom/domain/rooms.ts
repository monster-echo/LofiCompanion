import type { Locale } from '../../../i18n/core';
import { STUDY_ROOMS, type StudyRoomDef, type StudyRoomId } from './rooms.generated';

/**
 * 自习室房间目录（薄壳）：清单真源是 assets/study-rooms 下各 room.yaml，经
 * `npm run rooms:generate` 生成 rooms.generated.ts（见该文件头部说明）。
 * 房间 = 皮肤主题，id 与皮肤 slug 一致；房间媒体在渲染时从皮肤注册表
 * （focus.skins：内置默认 + 已拉取缓存的云端皮肤）解析。
 * 房间名是专有名词数据，双语文案随 yaml 走。
 * 与 biz-server 侧孪生定义（biz-server/src/features/studyroom/domain/rooms.ts）
 * 同口径——react-native/assets/study-rooms 为唯一源，server 白名单由 CI 校验对齐。
 */

export { STUDY_ROOMS, type StudyRoomDef, type StudyRoomId } from './rooms.generated';

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
