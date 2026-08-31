// 自习室房间目录：房间 = 内置皮肤主题，id 与 RN 侧皮肤 slug 一致
// （react-native/src/features/studyroom/domain/rooms.ts 的孪生定义；
// 仓库无共享包，两侧需同步维护）。

export const STUDY_ROOM_IDS = [
  'rainy-study-room',
  'sunny-classroom',
  'midnight-workstation',
] as const;

export type StudyRoomId = (typeof STUDY_ROOM_IDS)[number];

const ID_SET: ReadonlySet<string> = new Set<string>(STUDY_ROOM_IDS);

/** WS 入口与 room.switch 的白名单校验；非法 id 一律拒之门外。 */
export function isStudyRoomId(value: unknown): value is StudyRoomId {
  return typeof value === 'string' && ID_SET.has(value);
}
