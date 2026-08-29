import { z } from 'zod';

export const signUpSchema = z.object({
  email: z.email('邮箱格式不正确'),
  password: z.string().min(8, '密码至少 8 位').max(72),
  username: z.string().trim().min(2, '用户名至少 2 个字符').max(24),
  consentVersion: z.string().trim().min(1, '请先同意用户协议与隐私政策'),
  deviceName: z.string().trim().min(1).max(80).default('Zhongbei Auth client'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(20).max(200),
});

export const verifyEmailSchema = z.object({
  email: z.email(),
  code: z.string().regex(/^\d{6}$/),
});

export const resendVerifyEmailSchema = z.object({
  email: z.email(),
});

export const passwordPolicySchema = z.object({
  minLength: z.number().int().min(4).max(128),
  maxLength: z.number().int().min(8).max(256),
  requireUppercase: z.boolean(),
  requireLowercase: z.boolean(),
  requireDigit: z.boolean(),
  requireSymbol: z.boolean(),
}).strict();

export const signInSchema = z.object({
  identifier: z.string().trim().min(2, '请输入用户名、邮箱或手机号').max(254),
  password: z.string().min(1, '请输入密码').max(72),
  deviceName: z.string().trim().min(1).max(80).default('Zhongbei Auth client'),
});

export const phoneCodeRequestSchema = z.object({
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/, '请输入带国家区号的手机号'),
});

export const phoneCodeVerifySchema = phoneCodeRequestSchema.extend({
  code: z.string().regex(/^\d{6}$/),
  deviceName: z.string().trim().min(1).max(80).default('Zhongbei Auth client'),
});

export const forgotPasswordSchema = z.object({
  email: z.email(),
});

export const verifyResetCodeSchema = z.object({
  email: z.email(),
  code: z.string().regex(/^\d{6}$/),
});

export const resetPasswordSchema = z.object({
  resetToken: z.string().min(32).max(200),
  newPassword: z.string().min(8).max(72),
});

export const socialSignInSchema = z.object({
  provider: z.enum(['apple', 'google', 'github', 'huawei']),
  idToken: z.string().min(20).optional(),
  authorizationCode: z.string().min(3).optional(),
  redirectUri: z.url().optional(),
  codeVerifier: z.string().min(43).max(128).optional(),
  nonce: z.string().min(8).max(200).optional(),
  deviceName: z.string().trim().min(1).max(80).default('Zhongbei Auth client'),
});

export const profileSchema = z.object({
  // 支持修改 username（手机号登录自动生成的"手机用户xxxx"等可自定义）
  username: z.string().trim().min(2).max(24).optional(),
  displayName: z.string().trim().min(1).max(40).optional(),
  bio: z.string().trim().max(160).optional(),
  // 三种形态：https URL / 旧 base64 data:image / 对象存储 objectKey
  // （`<appId>/<env>/avatars/...`，私有 bucket presigned 显示）。
  // 空串规范化为 null（客户端未设置头像时可能发 ''）。
  avatarUrl: z.preprocess(
    (value) => (value === '' ? null : value),
    z.union([
      z.url(),
      z.string().startsWith('data:image/'),
      z.string().regex(/^[A-Za-z0-9._\-/]+$/, 'objectKey 只能含字母数字点横杠斜杠').max(512),
    ]).nullable().optional(),
  ),
}).strict();

export const passwordSchema = z.object({
  // 当前密码可选：无密码账号（手机号/华为登录，password_hash=external$xxx）首次设置密码时可不填
  currentPassword: z.string().min(1).max(72).optional(),
  newPassword: z.string().min(8).max(72),
});

export const settingsSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']).optional(),
  // 语言是开放集（BCP47 语言标签，如 zh-CN/en-US/ms-MY/ar-SA），不锁死中英。
  language: z.string().min(2).max(20).optional(),
  textScale: z.number().min(0.85).max(1.3).optional(),
  notificationsEnabled: z.boolean().optional(),
  marketingEnabled: z.boolean().optional(),
  analyticsEnabled: z.boolean().optional(),
  autoplayEnabled: z.boolean().optional(),
}).strict();

export const orderSchema = z.object({
  planId: z.string().min(1).max(80),
});

export const pushDeviceSchema = z.object({
  installationId: z.string().regex(/^[a-zA-Z0-9._-]{8,100}$/),
  provider: z.enum(['local', 'fcm', 'hms', 'apns']),
  token: z.string().min(16).max(4096),
  locale: z.string().min(2).max(20),
  timezone: z.string().min(1).max(80),
});

export const notificationJobSchema = z.object({
  type: z.string().regex(/^[a-z][a-z0-9_-]{1,39}$/),
  title: z.string().min(1).max(100),
  body: z.string().min(1).max(500),
  route: z.string().max(200).nullable().optional(),
});

const telemetryValueSchema = z.union([z.string().max(200), z.number(), z.boolean()]);

export const telemetryBatchSchema = z.object({
  anonymousId: z.string().min(8).max(80),
  sessionId: z.string().min(8).max(80),
  events: z.array(z.object({
    eventId: z.string().min(8).max(100),
    name: z.string().regex(/^[a-z][a-z0-9_]{1,39}$/),
    screenId: z.string().max(100).nullable().optional(),
    occurredAt: z.iso.datetime(),
    configVersion: z.number().int().nonnegative(),
    properties: z.record(z.string().max(40), telemetryValueSchema).default({}),
  })).min(1).max(50),
});

export const supportTicketSchema = z.object({
  category: z.string().regex(/^[a-z][a-z0-9_-]{1,39}$/),
  severity: z.enum(['normal', 'high', 'urgent']).default('normal'),
  subject: z.string().trim().min(4).max(100),
  message: z.string().trim().min(4).max(2000),
});

export const supportMessageSchema = z.object({
  message: z.string().trim().min(1).max(2000),
});

export const feedbackSchema = z.object({
  category: z.enum(['suggestion', 'experience', 'feature_request', 'other']),
  title: z.string().trim().min(4).max(100),
  body: z.string().trim().min(4).max(3000),
  rating: z.number().int().min(1).max(5).optional(),
  screenshots: z.array(z.object({
    fileName: z.string().trim().min(1).max(120),
    mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    data: z.string().startsWith('data:image/').max(1_500_000),
  }).strict()).max(3).default([]),
}).strict();

export const deletionSchema = z.object({
  password: z.string().min(1).max(72),
  confirmation: z.literal('DELETE'),
});

const tierSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(40),
  summary: z.string().max(100),
  recommended: z.boolean(),
  accent: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  entitlements: z.array(z.string()).max(50),
});

const storeProductMappingSchema = z.object({
  apple: z.string().min(1).max(200).optional(),
  google: z.string().min(1).max(200).optional(),
  hms: z.string().min(1).max(200).optional(),
}).optional();

const planSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  tierId: z.string().min(1),
  name: z.string().min(1).max(60),
  interval: z.enum(['month', 'year', 'lifetime', 'one_time']),
  priceMinor: z.number().int().nonnegative(),
  currency: z.string().length(3),
  originalPriceMinor: z.number().int().positive().optional(),
  provider: z.enum(['mock', 'apple', 'google', 'hms', 'wechat', 'alipay']),
  storeProductMapping: storeProductMappingSchema,
});

export const verifyPurchaseSchema = z.object({
  orderId: z.string().min(1).max(80).optional(),
  receipt: z.custom((v) => v !== undefined, { message: 'receipt is required' }),
});

export const restorePurchasesSchema = z.object({
  receipts: z.array(z.unknown()).min(1).max(50),
});

export const runtimeConfigSchema = z.object({
  schemaVersion: z.number().int().positive(),
  version: z.number().int().positive(),
  brand: z.object({
    appName: z.string().min(1).max(40),
    tagline: z.string().max(100),
    primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  }),
  splash: z.object({
    id: z.string().min(1),
    title: z.string().min(1).max(80),
    description: z.string().max(200),
    badge: z.string().max(30),
    actionLabel: z.string().min(1).max(30),
    imageUrl: z.url().nullable(),
    videoUrl: z.url().nullable(),
    linkUrl: z.url().nullable(),
    skippable: z.boolean(),
    durationSeconds: z.number().int().min(1).max(30),
  }).nullable(),
  cacheTtlSeconds: z.number().int().min(60).max(86400),
  telemetry: z.object({
    enabled: z.boolean(),
    backendEnabled: z.boolean(),
    firebaseMode: z.enum(['disabled', 'client_direct', 'server_forwarded']),
    analyticsEnabled: z.boolean(),
    crashlyticsEnabled: z.boolean(),
  }),
  support: z.object({
    enabled: z.boolean(),
    market: z.string().min(2).max(20),
    dataRegion: z.string().min(2).max(20),
    categories: z.array(z.object({
      id: z.string().regex(/^[a-z][a-z0-9_-]{1,39}$/),
      label: z.string().min(1).max(40),
    })).min(1).max(20),
    queues: z.array(z.object({
      id: z.string().regex(/^[a-z][a-z0-9_-]{1,39}$/),
      market: z.string().min(2).max(20),
      locales: z.array(z.string().min(2).max(20)).min(1).max(20),
      categories: z.array(z.string().min(2).max(40)).min(1).max(20),
    })).min(1).max(20),
    help: z.array(z.object({
      id: z.string().min(2).max(60),
      locale: z.string().min(2).max(20),
      title: z.string().min(1).max(100),
      body: z.string().min(1).max(3000),
    })).max(100),
  }),
  auth: z.object({
    providers: z.array(z.object({
      id: z.enum(['password', 'phone', 'apple', 'google', 'github', 'huawei', 'wechat']),
      enabled: z.boolean(),
      platforms: z.array(z.enum(['ios', 'android', 'harmonyos', 'web'])),
      clientIds: z.object({
        ios: z.string().min(3).max(200).optional(),
        android: z.string().min(3).max(200).optional(),
        harmonyos: z.string().min(3).max(200).optional(),
        web: z.string().min(3).max(200).optional(),
      }).optional(),
    })),
    passwordPolicy: passwordPolicySchema,
  }),
  legal: z.array(z.object({
    type: z.enum(['privacy', 'terms', 'subscription']),
    locale: z.enum(['zh-CN', 'en-US']),
    revision: z.string().min(1),
    title: z.string().min(1),
    content: z.string().min(1),
    requiresReconsent: z.boolean(),
  })),
  settingsPolicy: z.record(z.string(), z.object({
    visibility: z.enum(['visible', 'hidden']),
    mutability: z.enum(['user', 'admin_locked', 'system']),
  })),
  features: z.record(z.string(), z.boolean()),
  entitlements: z.array(z.object({
    key: z.string().min(1),
    label: z.string().min(1),
    description: z.string(),
  })),
  tiers: z.array(tierSchema).min(1).max(8),
  plans: z.array(planSchema).max(30),
}).superRefine((config, context) => {
  rejectDuplicates(config.tiers.map((tier) => tier.id), ['tiers'], context);
  rejectDuplicates(config.plans.map((plan) => plan.id), ['plans'], context);
  rejectDuplicates(config.entitlements.map((item) => item.key), ['entitlements'], context);
  rejectDuplicates(config.auth.providers.map((provider) => provider.id), ['auth', 'providers'], context);
  const tierIds = new Set(config.tiers.map((tier) => tier.id));
  for (const plan of config.plans) {
    if (!tierIds.has(plan.tierId)) {
      context.addIssue({
        code: 'custom',
        path: ['plans'],
        message: `方案 ${plan.id} 引用了不存在的等级`,
      });
    }
  }
  for (const plan of config.plans) {
    if (plan.provider === 'apple' || plan.provider === 'google' || plan.provider === 'hms') {
      const mapped = plan.storeProductMapping?.[plan.provider];
      if (!mapped) {
        context.addIssue({
          code: 'custom',
          path: ['plans'],
          message: `方案 ${plan.id} 的 provider=${plan.provider} 缺少 storeProductMapping.${plan.provider}`,
        });
      }
    }
  }
});

function rejectDuplicates(
  values: readonly string[],
  path: (string | number)[],
  context: z.RefinementCtx,
) {
  if (new Set(values).size === values.length) return;
  context.addIssue({ code: 'custom', path, message: '配置 key 不允许重复' });
}
