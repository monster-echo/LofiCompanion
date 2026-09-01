import { createInstance, type i18n as I18n } from 'i18next';

// i18n 核心（零 react-native / expo 导入，node 可测）：受支持语言、归一化、
// 实例工厂。React 集成（initReactI18next）与设备语言探测分属 index.ts /
// deviceLocale.ts——本文件必须可被 apiClient 等非 hook 模块在 vitest
// node 环境安全导入（见 vitest.config.ts 对 apiClient 启动契约的注释）。

export const SUPPORTED = ['zh-CN', 'en-US'] as const;

export type Locale = (typeof SUPPORTED)[number];

export const FALLBACK_LOCALE: Locale = 'en-US';

const SUPPORTED_SET: ReadonlySet<string> = new Set<string>(SUPPORTED);

/** BCP-47 标签归一化：zh-TW/zh-HK → zh-CN、en-GB → en-US、未知 → en-US。 */
export function normalizeLocale(tag: string | null | undefined): Locale {
  if (!tag) return FALLBACK_LOCALE;
  const lower = tag.trim().toLowerCase();
  if (SUPPORTED_SET.has(lower)) return lower as Locale;
  const prefix = lower.split('-')[0];
  if (prefix === 'zh') return 'zh-CN';
  if (prefix === 'en') return 'en-US';
  return FALLBACK_LOCALE;
}

/**
 * 创建未初始化的 i18next 实例。初始化（含 react 集成与资源注册）由
 * index.ts 在应用入口同步完成；测试用 initOptions() 自行 init。
 */
export function createI18n(): I18n {
  return createInstance();
}

export const i18n: I18n = createI18n();

/** 当前语言（归一化）；实例未初始化时回落 en-US。 */
export function currentLanguage(): Locale {
  return normalizeLocale(i18n.language);
}

/** 共享 init 选项：应用入口（带 react 插件）与测试（裸 init）共用一份配置。
 *  lng 接受任意 BCP-47 标签（测试用它验证不受支持语言的回落行为）。 */
export function initOptions(
  lng: string,
  resources: Record<Locale, Record<string, unknown>>,
): Record<string, unknown> {
  return {
    lng,
    fallbackLng: FALLBACK_LOCALE,
    supportedLngs: [...SUPPORTED],
    resources,
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
    // 同步初始化：t() 在任何渲染/导入方之前可用（index.js 先于 App 导入）
    initImmediate: false,
  };
}
