/**
 * 本文件由 scripts/generate-study-rooms.mjs 从 assets/study-rooms 下各 room.yaml 生成。
 * 请勿手改——编辑 YAML 后运行 `npm run rooms:generate` 重新生成；
 * CI/测试用 `npm run rooms:generate -- --check` 校验同步。
 * 房间目录以本清单为唯一源；biz-server 侧白名单由 CI 校验脚本对齐。
 */

export type StudyRoomId = "rainy-study-room" | "sunny-classroom" | "midnight-workstation";

export interface StudyRoomDef {
  readonly id: StudyRoomId;
  readonly nameZh: string;
  readonly nameEn: string;
  /** 播放内容引用的皮肤 slug（当前与 id 相同；解耦未来房间≠皮肤） */
  readonly skin: string;
  /** 房间画面固定基态：自习室恒按此态循环，不随个人专注会话流转 */
  readonly displayState: 'ready' | 'focusing' | 'paused' | 'resting';
}

/** 房间列表（顺序 = room.yaml order；首位为默认房间）。 */
export const STUDY_ROOMS: readonly StudyRoomDef[] = [
  {
    id: "rainy-study-room",
    nameZh: "雨夜书房",
    nameEn: "Rainy Study Room",
    skin: "rainy-study-room",
    displayState: "focusing",
  },
  {
    id: "sunny-classroom",
    nameZh: "晴日教室",
    nameEn: "Sunny Classroom",
    skin: "sunny-classroom",
    displayState: "focusing",
  },
  {
    id: "midnight-workstation",
    nameZh: "午夜工位",
    nameEn: "Midnight Workstation",
    skin: "midnight-workstation",
    displayState: "focusing",
  },
];
