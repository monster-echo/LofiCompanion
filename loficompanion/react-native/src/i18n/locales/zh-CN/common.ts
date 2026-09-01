// 跨域共用文案（zh-CN）。Phase 1 先立命名空间，键随 Phase 2 批次填充
// （如 close / justNow / retry）。
export const common = {
  connecting: '正在连接服务…',
  fetchingConfig: '正在从服务端获取最新配置',
  cannotConnect: '无法连接服务器',
  offlineHint: '请检查网络后重试；离线状态无法进入 App。',
  retry: '重试',
  retrying: '重试中…',
  back: '返回',
  close: '关闭',
  justNow: '刚刚',
  minutesAgo: '{{n}} 分钟前',
  hoursAgo: '{{n}} 小时前',
  daysAgo: '{{n}} 天前',
  openPage: '打开相关页面',
  markAsRead: '标记为已读',
  unreadNotice: '未读通知：{{title}}',
  notice: '通知：{{title}}',
  unread: '未读',
} as const;
