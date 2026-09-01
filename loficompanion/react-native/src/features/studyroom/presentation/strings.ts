/**
 * 自习室 zh-CN 文案常量（per-feature strings 惯例，对齐 focus/presentation/strings.ts；
 * P0-A 仅中文）。语气对齐 doc-08 §22：温和具体，无负担性语言。
 */

export const STUDY_ROOM_STRINGS = {
  // Tab 列表页：先选房，后进入
  roomTitle: '自习室',
  listSubtitle: '挑一间房，和正在学习的人坐在一起',
  onlineNow: (n: number) => `${n} 人在自习`,
  enterRoom: (name: string) => `进入${name}`,
  countsUnavailable: '在线人数暂时看不了，稍后再试',
  retry: '重试',
  // 房间页
  exitRoom: '退出自习室',
  quickMenuLabel: '快捷设置',
  keepAwakeLabel: '屏幕常亮',
  muteLabel: '静音',
  onState: '已开启',
  offState: '已关闭',
  connecting: '连接中…',
  reconnecting: '重连中…',
  closeLabel: '关闭',
  // 输入条（点击屏幕浮现，5s 无操作自动弱化）
  inputPlaceholder: '说点什么，为彼此加油…',
  signInToChat: '登录后加入弹幕',
  send: '发送',
  // 发送反馈
  rejectedBlocked: '这条弹幕未能发出，换句鼓励的话试试',
  rejectedTooLong: '弹幕最多 42 个字',
  cooldownHint: (s: number) => `休息一下，${s}s 后再发`,
  sendFailed: '弹幕发送失败，请稍后再试',
} as const;
