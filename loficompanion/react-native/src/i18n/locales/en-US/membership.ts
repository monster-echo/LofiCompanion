// membership 域文案（en 键集须与 zh deep-equal（parity.test.ts））。
export const membership = {
  // 会员中心
  title: 'Membership',
  heroTitle: 'Tiers that flex with your product',
  heroBody: 'Your setup includes {{tiers}} tiers and {{plans}} plans.',
  sectionPlans: 'Available plans',
  mockNotice: 'This is demo checkout — no real store or payment channel is called.',
  confirming: 'Confirming…',
  signInToSubscribe: 'Sign in to subscribe',
  mockOrder: 'Place demo order (not a real payment)',
  confirmSubscribe: 'Confirm subscription',
  emptyPlans: 'No plans are set up for this app yet.',
  browsePlusSkins: 'Browse Plus skin catalog',
  plusSkinValue: 'Plus unlocks the official curated skins',
  viewOrders: 'View order history',
  tierCurrent: 'Current tier',
  tierRecommended: 'Recommended',
  entitlementsCount: '{{n}} entitlements configured',
  planSelected: 'This plan is selected',
  planProvider: 'Payment channel: {{provider}}',
  interval: {
    month: 'mo',
    year: 'yr',
    lifetime: 'lifetime',
    one_time: 'use',
  },
  // 确认订阅（结账页）
  checkoutTitle: 'Confirm subscription',
  checkoutMockNotice: 'Demo checkout: completed through a mock channel.',
  // 订阅合规披露（App Store 审核指南 3.1.2 / Play 支付政策）：必须渲染在购买动作之前
  storeApple: 'App Store',
  storeGoogle: 'Google Play',
  checkoutDisclosureTitle: 'Auto-renewal details',
  checkoutDisclosure: 'Subscribing to {{plan}} at {{price}}. Payment will be charged to your {{store}} account at confirmation of purchase, and your subscription renews automatically unless canceled at least 24 hours before the end of the current period. You can manage or cancel anytime in your {{store}} subscription settings.',
  done: 'Done',
  retry: 'Retry',
  restorePurchases: 'Restore purchases',
  restoreDone: 'Your purchases have been restored',
  restoreNone: 'No purchases to restore',
  // 订阅管理入口（审核要求可跳转商店订阅设置）与法务文档
  manageSubscriptions: 'Manage subscription',
  legalLinks: 'Privacy policy & terms of use',
} as const;
