// 成就/记录/房间域文案（zh-CN 为权威源；doc-08 §8–§10、§22：温和具体，无负担性语言）。
export const achievements = {
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
  minutesValue: '{{n}} 分',
  timelineMinutes: '{{n}} 分钟',
  historyEmpty: '还没有学习记录',
  historyEmptyHint: '完成第一轮专注后会在这里留下记录',
  // S09 我的房间
  roomTitle: '我的房间',
  roomCaption: '学习成就会留在房间里',
  arrangeAction: '布置房间',
  arrangeComingSoon: '更多槽位即将推出',
  calloutSource: '来自「{{name}}」',
  backLabel: '返回',
  tileUnlockedA11y: '成就 {{name}}，已解锁{{date}}',
  tileLockedA11y: '成就 {{name}}，未解锁，{{description}}',
  // 成就名称/描述（domain 的 AchievementDef 只存 ruleKey，键由此构造）
  rule: {
      first_focus: { name: '第一次专注', description: '完成第一次专注' },
      streak_7: { name: '连续七天', description: '连续 7 天每天至少完成一次专注' },
      rainy_10h: { name: '雨夜十小时', description: '累计有效专注满 10 小时' },
      sessions_100: { name: '百轮学习', description: '累计完成 100 次专注' },
  },
  // 房间收藏物展示名（doc-08 §7「获得：雨夜书签」与 doc-01 §5.6）
  item: {
    bookmark: '雨夜书签',
    lamp: '书房台灯',
    plant: '桌边绿植',
    group_photo: '学习小组合影',
  },
} as const;
