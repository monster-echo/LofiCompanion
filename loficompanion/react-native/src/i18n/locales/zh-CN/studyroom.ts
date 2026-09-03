// 自习室域文案（zh-CN 为权威源；自 features/studyroom/presentation/strings.ts 迁入）。
export const studyroom = {
  // 列表页
  roomTitle: '自习室',
  listSubtitle: '挑一间房，和正在学习的人坐在一起',
  onlineNow: '{{n}} 人在自习',
  enterRoom: '进入{{name}}',
  countsUnavailable: '在线人数暂时看不了，稍后再试',
  retry: '重试',
  // 房间页
  exitRoom: '退出自习室',
  quickMenuLabel: '快捷设置',
  keepAwakeLabel: '屏幕常亮',
  muteLabel: '静音',
  danmakuPositionLabel: '弹幕位置',
  danmakuBandTop: '顶部',
  danmakuBandCenter: '中部',
  danmakuBandBottom: '底部',
  onState: '已开启',
  offState: '已关闭',
  connecting: '连接中…',
  reconnecting: '重连中…',
  closeLabel: '关闭',
  // 输入条
  inputPlaceholder: '说点什么，为彼此加油…',
  signInToChat: '登录后加入弹幕',
  send: '发送',
  // 发送反馈
  rejectedBlocked: '这条弹幕未能发出，换句鼓励的话试试',
  rejectedTooLong: '弹幕最多 42 个字',
  cooldownHint: '休息一下，{{s}}s 后再发',
  sendFailed: '弹幕发送失败，请稍后再试',
} as const;
