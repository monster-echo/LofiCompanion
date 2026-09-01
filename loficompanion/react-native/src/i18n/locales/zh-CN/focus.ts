// 专注域文案（zh-CN 为权威源；自 features/focus/presentation/strings.ts 迁入。
// doc-08 §22：温和具体，无负担性语言；喝水无手动按钮，事件提醒由陪伴画面承担）。
export const focus = {
  // S02 今日首页
  greeting: '今晚一起写作业吗？',
  boardEmpty: '从第一轮开始布置你的房间',
  startFocus: '开始专注',
  backToFocus: '返回专注',
  todayMinutes: '今日 {{n}} 分钟',
  doneSessions: '已完成 {{n}} 轮',
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
  musicLabel: '背景音乐',
  musicGuestHint: '登录解锁完整歌单',
  nowPlaying: '正在播放 {{title}}',
  // S04 专注中（右上快捷设置二级菜单，开启态读作「已选择」）
  quickMenuLabel: '快捷设置',
  keepAwakeLabel: '屏幕常亮',
  muteLabel: '静音',
  onState: '已开启',
  offState: '已关闭',
  paused: '已暂停',
  pauseAction: '暂停',
  resumeAction: '继续',
  endAction: '结束',
  endConfirmTitle: '提前结束这轮？',
  endConfirmStay: '再坚持一下',
  endConfirmLeave: '确认结束',
  endConfirmKept: '已专注的 {{n}} 分钟会保留下来，剩余时间不计入。',
  endConfirmKeptZero: '这轮还不足 1 分钟，结束后不会计入记录。',
  keptMinutes: '已保留 {{n}} 分钟记录',
  keptNothing: '已结束这轮，不足 1 分钟未计入记录',
  // S06 完成结算
  completeTitle: '这一轮完成了',
  againAction: '再来一轮',
  finishToday: '结束今天',
  // 活动类型 → 展示名（doc-08 §4 S03 活动标签）
  activity: {
    homework: '写作业',
    reading: '阅读',
    coding: '编程',
    vocab: '背单词',
    free: '自由专注',
  },
  // 活动类型 → 专注中左上陪伴状态（概念图：主题名下方状态行）
  status: {
    homework: '正在陪你写作业',
    reading: '正在陪你阅读',
    coding: '正在陪你写代码',
    vocab: '正在陪你背单词',
    free: '正在陪你专注',
  },
} as const;
