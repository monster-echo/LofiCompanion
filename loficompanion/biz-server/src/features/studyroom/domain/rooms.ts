// 自习室房间目录：房间 = 内置皮肤主题，id 与 RN 侧皮肤 slug 一致。
// 唯一数据源 = react-native/assets/study-rooms/*/room.yaml（生成
// rooms.generated.ts）；本清单为校验端孪生，由 scripts/check-rooms.mjs
// （挂 react-native CI）比对 id 集合与顺序，不一致即红。

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
