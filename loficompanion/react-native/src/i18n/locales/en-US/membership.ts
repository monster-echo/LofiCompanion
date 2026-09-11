// membership 域文案（en 键集须与 zh deep-equal（parity.test.ts））。
// 2026-09 scene-based redesign: sell benefits, not configuration.
export const membership = {
  title: 'Membership',
  // Scene hero (purchase state)
  heroTitle: 'Tonight, let Plus keep you company',
  heroSubtitle: 'Every curated skin, plus advanced abilities',
  sectionBenefits: 'Plus benefits',
  sectionPlans: 'Choose a plan',
  sectionSkins: 'Curated skins',
  // Entitlement keys (docs/05 §4) → user-facing copy
  benefitCatalogPremium: 'Every curated skin',
  benefitSkinOfficial: 'Official curated skins',
  benefitRoomSlots: 'Advanced room slots',
  benefitInsights: 'Advanced study insights',
  benefitCustomGen: 'Custom generation flow',
  // Tier/plan catalog (server bootstrap, currently zh-only) translated at render time:
  // keys map registered catalog ids (see domain/membershipCopy.ts); unregistered ids fall back to server copy
  tierFreeSummary: 'Core focus sessions, three free skins, and study history',
  tierPlusSummary: 'Every skin, advanced room layout, and study insights',
  planPlusMonthly: 'Plus Monthly',
  planPlusYearly: 'Plus Yearly',
  // Plan cards
  planRecommended: 'Best value',
  planSavings: 'Save {{percent}}%',
  // Sticky CTA
  confirmSubscribe: 'Subscribe',
  mockNotice: 'This is demo checkout — no real store or payment channel is called.',
  confirming: 'Confirming…',
  signInToSubscribe: 'Sign in to subscribe',
  mockOrder: 'Place demo order (not a real payment)',
  emptyPlans: 'No plans are set up for this app yet.',
  // Member card (subscribed state)
  memberBadgeActive: 'Active',
  memberBadgeExpired: 'Expired',
  renewsOn: 'Renews on {{date}}',
  subscriptionExpiredHint: 'Your subscription has lapsed. Renew to keep your benefits',
  memberRenew: 'Renew',
  memberFallbackTitle: 'Member',
  memberCardSubtitle: 'Your benefits are live and ready',
  memberManage: 'Manage subscription',
  memberChangeSkin: 'Change skin',
  // Footer text links
  linkRestore: 'Restore purchases',
  linkManageSubs: 'Manage subscription',
  linkLegal: 'Privacy & terms',
  linkStore: 'Browse Plus skins',
  linkOrders: 'Order history',
  restoreDone: 'Your purchases have been restored',
  restoreNone: 'No purchases to restore',
  // Billing intervals (formatPrice builds "¥x/mo"; reused by CheckoutScreen)
  interval: {
    month: 'mo',
    year: 'yr',
    lifetime: 'lifetime',
    one_time: 'use',
  },
  // Checkout
  checkoutTitle: 'Confirm subscription',
  checkoutMockNotice: 'Demo checkout: completed through a mock channel.',
  // Subscription compliance disclosure (App Store 3.1.2 / Play payments policy): must render before the purchase action
  storeApple: 'App Store',
  storeGoogle: 'Google Play',
  checkoutDisclosureTitle: 'Auto-renewal details',
  checkoutDisclosure: 'Subscribing to {{plan}} at {{price}}. Payment will be charged to your {{store}} account at confirmation of purchase, and your subscription renews automatically unless canceled at least 24 hours before the end of the current period. You can manage or cancel anytime in your {{store}} subscription settings.',
  done: 'Done',
  retry: 'Retry',
} as const;
