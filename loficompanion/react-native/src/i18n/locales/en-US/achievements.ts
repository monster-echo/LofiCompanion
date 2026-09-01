// 成就/记录/房间域文案（en-US）。语气规范 doc-08 §22：温和具体、无负担性语言。
export const achievements = {
  // S07 学习成就
  screenTitle: 'Achievements',
  metricTotal: 'Total focus',
  metricRounds: 'Sessions done',
  metricStreak: 'Day streak',
  metricWeek: 'Minutes this week',
  unitHours: 'h',
  unitRounds: 'sessions',
  unitDays: 'days',
  unitMinutes: 'min',
  myAchievements: 'My achievements',
  historyLink: 'Study history',
  roomLink: 'My room',
  startFirstRound: 'Start your first session',
  emptyRoomCaption: 'Current room',
  emptyHint: 'Finish your first focus session to bring your first keepsake into the room',
  // S08 学习记录
  historyTitle: 'Study history',
  periodThisWeek: 'This week',
  activityBreakdown: 'By activity',
  timelineTitle: 'Study history',
  minutesValue: '{{n}} min',
  timelineMinutes: '{{n}} min',
  historyEmpty: 'No study history yet',
  historyEmptyHint: 'Your first finished focus session will show up here',
  // S09 我的房间
  roomTitle: 'My room',
  roomCaption: 'Your achievements stay in this room',
  arrangeAction: 'Arrange room',
  arrangeComingSoon: 'More slots coming soon',
  calloutSource: 'From “{{name}}”',
  backLabel: 'Back',
  tileUnlockedA11y: 'Achievement {{name}}, unlocked{{date}}',
  tileLockedA11y: 'Achievement {{name}}, locked — {{description}}',
  // 成就名称/描述（domain 的 AchievementDef 只存 ruleKey，键由此构造）
  rule: {
      first_focus: { name: 'First focus', description: 'Complete your first focus session' },
      streak_7: { name: 'Seven-day streak', description: 'Focus at least once a day for 7 days in a row' },
      rainy_10h: { name: 'Rainy-night ten hours', description: 'Reach 10 hours of effective focus' },
      sessions_100: { name: 'Hundred sessions', description: 'Complete 100 focus sessions' },
  },
  // 房间收藏物展示名
  item: {
    bookmark: 'Rainy-night bookmark',
    lamp: 'Study lamp',
    plant: 'Desk plant',
    group_photo: 'Study-group photo',
  },
} as const;
