// membership 域文案（zh 为权威源）。2026-09 场景化改版：卖权益不卖配置——
// 场景 hero + 权益清单（entitlement 键翻译成人话）+ 双价格卡 + 粘性 CTA +
// 会员卡态；开发者向文案（配置计数/支付渠道暴露）已删。
export const membership = {
  title: '会员中心',
  // 场景 hero（购买态）
  heroTitle: '今晚，让 Plus 陪你',
  heroSubtitle: '全部精选皮肤与高级能力',
  sectionBenefits: 'Plus 权益',
  sectionPlans: '选择方案',
  sectionSkins: '精选皮肤',
  // 权益键（docs/05 §4）→ 用户文案
  benefitCatalogPremium: '全部精选皮肤',
  benefitSkinOfficial: '官方精选皮肤',
  benefitRoomSlots: '高级布置槽位',
  benefitInsights: '高级学习洞察',
  benefitCustomGen: '定制生成流程',
  // 等级/方案目录（服务端 bootstrap 下发，当前仅中文）渲染期翻译：
  // 键 = 已登记目录 id（映射见 domain/membershipCopy.ts），未登记 id 回落服务端原文
  tierFreeSummary: '基础专注、三套免费皮肤与学习记录',
  tierPlusSummary: '全部皮肤、高级房间布置与学习洞察',
  planPlusMonthly: 'Plus 月度',
  planPlusYearly: 'Plus 年度',
  // 方案卡
  planRecommended: '推荐',
  planSavings: '省 {{percent}}%',
  // 粘性 CTA
  confirmSubscribe: '确认订阅',
  mockNotice: '当前为演示支付，不会调用真实商店或支付渠道。',
  confirming: '正在确认…',
  signInToSubscribe: '登录后订阅',
  mockOrder: '演示下单（非真实支付）',
  emptyPlans: '当前 App 暂未配置可售方案。',
  // 会员卡（已订阅态）
  memberBadgeActive: '生效中',
  memberBadgeExpired: '已过期',
  renewsOn: '下次续费 {{date}}',
  subscriptionExpiredHint: '订阅已到期，续费后权益继续生效',
  memberRenew: '续费',
  memberFallbackTitle: '会员',
  memberCardSubtitle: '权益已生效，随时可用',
  memberManage: '管理订阅',
  memberChangeSkin: '换皮肤',
  // 底部小字链接
  linkRestore: '恢复购买',
  linkManageSubs: '管理订阅',
  linkLegal: '隐私与条款',
  linkStore: '浏览 Plus 皮肤',
  linkOrders: '订单记录',
  restoreDone: '已恢复你的购买',
  restoreNone: '没有找到可恢复的购买',
  // 计费周期（formatPrice 拼接「¥x/月」；CheckoutScreen 复用）
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
} as const;
