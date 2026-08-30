import type { RoomItemId } from '../domain/rules';

/**
 * 成就/记录/房间域 zh-CN 文案常量（doc-08 §8–§10、§22：温和具体，
 * 无负担性语言）。P0-A 仅中文。
 */

export const ACHIEVEMENT_STRINGS = {
  // S07 学习成就
  screenTitle: '学习成就',
  metricTotal: '累计专注',
  metricRounds: '完成轮数',
  metricStreak: '连续学习',
  metricWeek: '本周分钟',
  unitHours: '小时',
  unitRounds: '轮',
  unitDays: '天',
  unitMinutes: '分',
  myAchievements: '我的成就',
  historyLink: '学习记录',
  roomLink: '我的房间',
  startFirstRound: '开始第一轮',
  emptyRoomCaption: '当前房间',
  emptyHint: '完成第一轮专注，把第一件收藏物带进房间',
  // S08 学习记录
  historyTitle: '学习记录',
  periodThisWeek: '本周',
  activityBreakdown: '科目分布',
  timelineTitle: '学习记录',
  minutesValue: (n: number) => `${n} 分`,
  timelineMinutes: (n: number) => `${n} 分钟`,
  historyEmpty: '还没有学习记录',
  historyEmptyHint: '完成第一轮专注后会在这里留下记录',
  // S09 我的房间
  roomTitle: '我的房间',
  roomCaption: '学习成就会留在房间里',
  arrangeAction: '布置房间',
  arrangeComingSoon: '更多槽位即将推出',
  calloutSource: (achievementName: string) => `来自「${achievementName}」`,
  backLabel: '返回',
} as const;

/** 房间收藏物 → 展示名（对齐 doc-08 §7「获得：雨夜书签」与 doc-01 §5.6） */
export const ROOM_ITEM_NAMES: Record<RoomItemId, string> = {
  bookmark: '雨夜书签',
  lamp: '书房台灯',
  plant: '桌边绿植',
  group_photo: '学习小组合影',
};
