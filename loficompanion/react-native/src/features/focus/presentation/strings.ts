import type { ActivityType } from '../domain/types';

/**
 * 专注域 zh-CN 文案常量（doc-08 §22：温和具体，无负担性语言）。
 * P0-A 仅中文；模板 i18n 基建不动，后续接入再迁移。
 */

export const FOCUS_STRINGS = {
  // S02 今日首页
  greeting: '今晚一起写作业吗？',
  online: '正在陪你',
  boardEmpty: '从第一轮开始布置你的房间',
  startFocus: '开始专注',
  backToFocus: '返回专注',
  todayMinutes: (n: number) => `今日 ${n} 分钟`,
  doneSessions: (n: number) => `已完成 ${n} 轮`,
  chooseActivity: '选择活动与时长',
  // S03 创建 sheet
  setupTitle: '这次要做什么？',
  customLabel: '自定义',
  customUnit: '分钟',
  customPlaceholder: '5–180',
  customError: '请输入 5–180 的整数分钟',
  beginFocus: '开始专注',
  invalidSession: '活动或时长无效，请调整后再开始',
  sessionRunning: '已有一轮专注正在进行',
  // S04 专注中（喝水无手动按钮：由主题 wellness.autoDrink 自动排程触发）
  paused: '已暂停',
  pauseAction: '暂停',
  resumeAction: '继续',
  endAction: '结束',
  endConfirmTitle: '提前结束这轮？',
  endConfirmStay: '再坚持一下',
  endConfirmLeave: '确认结束',
  endConfirmKept: (n: number) => `已专注的 ${n} 分钟会保留下来，剩余时间不计入。`,
  endConfirmKeptZero: '这轮还不足 1 分钟，结束后不会计入记录。',
  keptMinutes: (n: number) => `已保留 ${n} 分钟记录`,
  keptNothing: '已结束这轮，不足 1 分钟未计入记录',
  drinkBannerTitle: '喝水事件',
  drinkBannerSubtitle: '休息一下，记得补充水分',
  startBannerTitle: '开始专注',
  startBannerSubtitle: '这一轮开始了，慢慢进入状态',
  pauseBannerTitle: '已暂停',
  pauseBannerSubtitle: '时间停在这里，回来就好',
  resumeBannerTitle: '回到专注',
  resumeBannerSubtitle: '欢迎回来，继续刚才的节奏',
  completeBannerTitle: '这一轮完成了',
  completeBannerSubtitle: '去看看今天的成果吧',
  defaultBannerTitle: '陪伴中',
  defaultBannerSubtitle: '我们继续',
  // S06 完成结算
  completeTitle: '这一轮完成了',
  againAction: '再来一轮',
  finishToday: '结束今天',
} as const;

/** 活动类型 → 展示名（doc-08 §4 S03 活动标签） */
export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  homework: '写作业',
  reading: '阅读',
  coding: '编程',
  vocab: '背单词',
  free: '自由专注',
};

/** S03 活动单选项（展示顺序即标签排列顺序） */
export const ACTIVITY_OPTIONS: readonly { type: ActivityType; label: string }[] = (
  ['homework', 'reading', 'coding', 'vocab', 'free'] as const
).map((type) => ({ type, label: ACTIVITY_LABELS[type] }));
