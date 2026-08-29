// RuntimeConfig 各枚举字段的可选值，供可视化表单的下拉/多选使用。
export const PLATFORM_OPTIONS = ['ios', 'android', 'harmonyos', 'web'] as const;
export const ENVIRONMENT_OPTIONS = ['development', 'staging', 'production'] as const;
export const AUTH_PROVIDER_OPTIONS = [
  'password', 'phone', 'apple', 'google', 'github', 'wechat',
] as const;
export const FIREBASE_MODE_OPTIONS = [
  'disabled', 'client_direct', 'server_forwarded',
] as const;
export const PLAN_INTERVAL_OPTIONS = ['month', 'year', 'lifetime', 'one_time'] as const;
export const PAYMENT_PROVIDER_OPTIONS = [
  'mock', 'apple', 'google', 'wechat', 'alipay',
] as const;
export const LEGAL_TYPE_OPTIONS = ['privacy', 'terms', 'subscription'] as const;
export const LEGAL_LOCALE_OPTIONS = ['zh-CN', 'en-US'] as const;
export const VISIBILITY_OPTIONS = ['visible', 'hidden'] as const;
export const MUTABILITY_OPTIONS = ['user', 'admin_locked', 'system'] as const;
export const LOCALE_OPTIONS = ['zh-CN', 'en-US'] as const;
