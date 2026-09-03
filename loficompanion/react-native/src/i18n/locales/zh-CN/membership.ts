// membership 域文案（zh 为权威源）。
export const membership = {
  // 会员中心
  title: '会员中心',
  heroTitle: '按产品动态组合等级',
  heroBody: '当前配置包含 {{tiers}} 个等级与 {{plans}} 个方案。',
  sectionPlans: '可订阅方案',
  mockNotice: '当前为演示支付，不会调用真实商店或支付渠道。',
  confirming: '正在确认…',
  signInToSubscribe: '登录后订阅',
  mockOrder: '演示下单（非真实支付）',
  confirmSubscribe: '确认订阅',
  emptyPlans: '当前 App 暂未配置可售方案。',
  browsePlusSkins: '浏览 Plus 皮肤目录',
  plusSkinValue: 'Plus 会员解锁官方精选皮肤',
  viewOrders: '查看订单记录',
  tierCurrent: '当前等级',
  tierRecommended: '推荐',
  entitlementsCount: '{{n}} 项已配置权益',
  planSelected: '已选择此方案',
  planProvider: '支付渠道：{{provider}}',
  interval: {
    month: '月',
    year: '年',
    lifetime: '终身',
    one_time: '次',
  },
  // 确认订阅（结账页）
  checkoutTitle: '确认订阅',
  checkoutMockNotice: '演示支付：通过模拟渠道完成。',
  // 订阅合规披露（App Store 审核指南 3.1.2 / Play 支付政策）：必须渲染在购买动作之前
  storeApple: 'App Store',
  storeGoogle: 'Google Play',
  checkoutDisclosureTitle: '自动续期说明',
  checkoutDisclosure: '订阅 {{plan}}（{{price}}）：付款将在确认购买时记入你的 {{store}} 账户，并按所选周期自动续期，除非在当前周期结束前至少 24 小时取消。你可在 {{store}} 的订阅设置中随时管理或取消订阅。',
  done: '完成',
  retry: '重试',
  restorePurchases: '恢复购买',
  restoreDone: '已恢复你的购买',
  restoreNone: '没有找到可恢复的购买',
  // 订阅管理入口（审核要求可跳转商店订阅设置）与法务文档
  manageSubscriptions: '管理订阅',
  legalLinks: '隐私政策与用户条款',
} as const;
