export type SplashCampaign = Readonly<{
  id: string;
  title: string;
  description: string;
  badge: string;
  actionLabel: string;
  imageUrl: string | null;
  videoUrl: string | null;
  linkUrl: string | null;
  skippable: boolean;
  durationSeconds: number;
}>;

export type Entitlement = Readonly<{
  key: string;
  label: string;
  description: string;
}>;

export type MembershipTier = Readonly<{
  id: string;
  name: string;
  summary: string;
  recommended: boolean;
  accent: string;
  entitlements: readonly string[];
}>;

export type StoreProductMapping = Readonly<{ apple?: string; google?: string; hms?: string }>;

export type BillingPlan = Readonly<{
  id: string;
  tierId: string;
  name: string;
  interval: 'month' | 'year' | 'lifetime' | 'one_time';
  priceMinor: number;
  currency: string;
  originalPriceMinor?: number;
  provider: 'mock' | 'apple' | 'google' | 'hms' | 'wechat' | 'alipay';
  storeProductMapping?: StoreProductMapping;
}>;

export type PasswordPolicy = Readonly<{
  minLength: number;
  maxLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireDigit: boolean;
  requireSymbol: boolean;
}>;

export type SupportConfig = Readonly<{
  enabled: boolean;
  market: string;
  dataRegion: string;
  categories: ReadonlyArray<Readonly<{ id: string; label: string }>>;
  queues: ReadonlyArray<Readonly<{
    id: string;
    market: string;
    locales: readonly string[];
    categories: readonly string[];
  }>>;
  help: ReadonlyArray<Readonly<{
    id: string;
    locale: string;
    title: string;
    body: string;
  }>>;
}>;

/**
 * 客户端语义色板键集（与客户端 ThemeColors 键集一一对应）。
 * 值允许 #RRGGBB 十六进制或 rgba() 字符串——客户端直接原样应用。
 */
export type ThemeColorKey =
  | 'background' | 'surface' | 'surfaceRaised' | 'surfaceMuted' | 'text' | 'textSecondary' | 'border'
  | 'brand' | 'brandPressed' | 'brandSoft'
  | 'success' | 'warning' | 'warningSoft' | 'error' | 'info'
  | 'membershipBronze' | 'membershipSilver' | 'membershipGold' | 'scrim';

export type ThemePalette = Readonly<Record<ThemeColorKey, string>>;

export type RuntimeConfig = Readonly<{
  schemaVersion: number;
  version: number;
  brand: Readonly<{
    appName: string;
    tagline: string;
    primaryColor: string;
  }>;
  /** 客户端颜色系统（auth 服务保存的整套语义色板；客户端以其覆盖内置 tokens）。 */
  theme: ThemePalette;
  splash: SplashCampaign | null;
  cacheTtlSeconds: number;
  telemetry: Readonly<{
    enabled: boolean;
    backendEnabled: boolean;
    firebaseMode: 'disabled' | 'client_direct' | 'server_forwarded';
    analyticsEnabled: boolean;
    crashlyticsEnabled: boolean;
  }>;
  support: SupportConfig;
  auth: Readonly<{
    providers: ReadonlyArray<Readonly<{
      id: 'password' | 'phone' | 'apple' | 'google' | 'github' | 'huawei' | 'wechat';
      enabled: boolean;
      platforms: readonly ('ios' | 'android' | 'harmonyos' | 'web')[];
      clientIds?: Readonly<Partial<Record<'ios' | 'android' | 'harmonyos' | 'web', string>>>;
    }>>;
    passwordPolicy: PasswordPolicy;
  }>;
  legal: ReadonlyArray<Readonly<{
    type: 'privacy' | 'terms' | 'subscription';
    locale: 'zh-CN' | 'en-US';
    revision: string;
    title: string;
    content: string;
    requiresReconsent: boolean;
  }>>;
  settingsPolicy: Readonly<Record<string, Readonly<{
    visibility: 'visible' | 'hidden';
    mutability: 'user' | 'admin_locked' | 'system';
  }>>>;
  features: Readonly<Record<string, boolean>>;
  entitlements: readonly Entitlement[];
  tiers: readonly MembershipTier[];
  plans: readonly BillingPlan[];
}>;

export const defaultConfig: RuntimeConfig = {
  schemaVersion: 1,
  version: 2,
  brand: {
    appName: 'Lofi Companion',
    tagline: '安静开始，专注完成',
    primaryColor: '#4F8FE8',
  },
  // doc-07 夜色设计令牌（与客户端 tokens.ts colors 逐项一致）
  theme: {
    background: '#091522',
    surface: '#0D1B2B',
    surfaceRaised: '#122338',
    surfaceMuted: '#06101C',
    text: '#F3EFE7',
    textSecondary: '#B4BECA',
    border: 'rgba(243,239,231,0.08)',
    brand: '#4F8FE8',
    brandPressed: '#3E79C9',
    brandSoft: 'rgba(79,143,232,0.16)',
    success: '#63BF94',
    warning: '#D6A556',
    warningSoft: 'rgba(214,165,86,0.16)',
    error: '#D66C72',
    info: '#6EA6F2',
    membershipBronze: '#A97E5C',
    membershipSilver: '#9AA4B2',
    membershipGold: '#C9A45C',
    scrim: 'rgba(6,16,28,0.88)',
  },
  splash: {
    id: 'lofi-opening',
    title: '今晚，从一间安静的房间开始',
    description: '选一位陪伴角色，放一段 lofi，完成你的第一轮专注。',
    badge: '新学期',
    actionLabel: '进入房间',
    imageUrl: null,
    videoUrl: null,
    linkUrl: null,
    skippable: true,
    durationSeconds: 5,
  },
  cacheTtlSeconds: 900,
  telemetry: {
    enabled: true,
    backendEnabled: true,
    firebaseMode: 'client_direct',
    analyticsEnabled: true,
    crashlyticsEnabled: true,
  },
  support: {
    enabled: true,
    market: 'global',
    dataRegion: 'us',
    categories: [
      { id: 'account', label: '账号与登录' },
      { id: 'billing', label: '会员与支付' },
      { id: 'technical', label: '功能故障' },
      { id: 'privacy', label: '隐私与数据' },
      { id: 'suggestion', label: '产品建议' },
    ],
    queues: [
      {
        id: 'china-zh',
        market: 'CN',
        locales: ['zh-CN'],
        categories: ['account', 'billing', 'technical', 'privacy', 'suggestion'],
      },
      {
        id: 'global',
        market: 'global',
        locales: ['zh-CN', 'en-US'],
        categories: ['account', 'billing', 'technical', 'privacy', 'suggestion'],
      },
    ],
    help: [
      {
        id: 'account-security',
        locale: 'zh-CN',
        title: '如何保护账号安全？',
        body: '请使用独立密码，并定期检查“登录设备”。发现异常设备后立即撤销会话并修改密码。',
      },
      {
        id: 'subscription',
        locale: 'zh-CN',
        title: '如何管理会员？',
        body: '在“会员中心”查看当前等级、可用权益、订单以及服务端下发的订阅方案。',
      },
      {
        id: 'account-security-en',
        locale: 'en-US',
        title: 'How do I protect my account?',
        body: 'Use a unique password and review signed-in devices regularly.',
      },
    ],
  },
  auth: {
    providers: [
      { id: 'password', enabled: true, platforms: ['ios', 'android', 'harmonyos', 'web'] },
      { id: 'phone', enabled: true, platforms: ['ios', 'android', 'harmonyos', 'web'] },
      { id: 'apple', enabled: true, platforms: ['ios', 'android', 'web'] },
      { id: 'google', enabled: true, platforms: ['ios', 'android', 'web'] },
      { id: 'github', enabled: true, platforms: ['ios', 'android', 'harmonyos', 'web'] },
      { id: 'huawei', enabled: true, platforms: ['harmonyos'], clientIds: {} },
      { id: 'wechat', enabled: false, platforms: ['ios', 'android', 'harmonyos'] },
    ],
    passwordPolicy: {
      minLength: 8,
      maxLength: 72,
      requireUppercase: false,
      requireLowercase: true,
      requireDigit: true,
      requireSymbol: false,
    },
  },
  legal: defaultLegalDocuments,
  settingsPolicy: {
    language: { visibility: 'visible', mutability: 'user' },
    appearance: { visibility: 'visible', mutability: 'user' },
    notifications: { visibility: 'visible', mutability: 'user' },
    general: { visibility: 'visible', mutability: 'user' },
    analytics: { visibility: 'visible', mutability: 'user' },
    accountDeletion: { visibility: 'visible', mutability: 'user' },
  },
  features: {
    membership: true,
    notifications: true,
    profileEditing: true,
    accountDeletion: true,
    statistics: false,
    coupons: false,
    invites: false,
  },
  // 权益键对齐 docs/05-MONETIZATION.md §4；生成额度走 credit ledger，不在此列
  entitlements: [
    { key: 'catalog.premium.active', label: '高级皮肤目录', description: '订阅期内畅享全部官方与季节皮肤' },
    { key: 'room.advanced_slots', label: '高级房间布置', description: '更多房间槽位、环境音与事件动作' },
    { key: 'insights.advanced', label: '高级学习洞察', description: '深度学习统计与跨设备皮肤/房间同步' },
    { key: 'generation.custom.enabled', label: 'AI 定制皮肤', description: '生成属于你的陪伴角色与房间' },
  ],
  tiers: [
    {
      id: 'free',
      name: 'Free',
      summary: '基础专注、三套免费皮肤与学习记录',
      recommended: false,
      accent: '#667085',
      entitlements: [],
    },
    {
      id: 'plus',
      name: 'Companion Plus',
      summary: '全部皮肤、高级房间布置与学习洞察',
      recommended: true,
      accent: '#4F8FE8',
      entitlements: [
        'catalog.premium.active',
        'room.advanced_slots',
        'insights.advanced',
        'generation.custom.enabled',
      ],
    },
  ],
  plans: [
    {
      id: 'plus-monthly',
      tierId: 'plus',
      name: 'Plus 月度',
      interval: 'month',
      priceMinor: 1800,
      currency: 'CNY',
      provider: 'mock',
      storeProductMapping: { apple: 'com.zhongbei.plus.monthly', google: 'plus_monthly_001', hms: 'plus_monthly_001' },
    },
    {
      id: 'plus-yearly',
      tierId: 'plus',
      name: 'Plus 年度',
      interval: 'year',
      priceMinor: 16800,
      originalPriceMinor: 21600,
      currency: 'CNY',
      provider: 'mock',
      storeProductMapping: { apple: 'com.zhongbei.plus.yearly', google: 'plus_yearly_001', hms: 'plus_yearly_001' },
    },
  ],
};
import { defaultLegalDocuments } from './legal-documents';
