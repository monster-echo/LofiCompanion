import React, { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { useApp } from '../state/AppStore';
import { colors, semantic, lightColors, semanticLight, ThemeColors } from '../theme/tokens';
import { applyTheme } from '../theme/styles';
import { currentLanguage, i18n, type Locale } from '../i18n/core';
import { deviceLocale } from '../i18n/deviceLocale';
import { resolveLocale } from '../i18n/localePreference';
import { readLocaleOverride } from '../data/storage';
import type { resources } from '../i18n/resources';

type ThemeMode = 'system' | 'light' | 'dark';

// settings 命名空间的键（text() 的合法入参；Phase 2.4 后由 useTranslation 取代）
export type TranslationKey = keyof (typeof resources)['zh-CN']['settings'] & string;

type PreferencesValue = Readonly<{
  locale: Locale;
  mode: ThemeMode;
  dark: boolean;
  palette: ThemeColors;
  textScale: number;
  text: (key: TranslationKey) => string;
}>;

const PreferencesContext = createContext<PreferencesValue | null>(null);

export function PreferencesProvider({ children }: Readonly<{ children: ReactNode }>) {
  const { user, config } = useApp();
  const systemScheme = useColorScheme();
  const mode = normalizeTheme(user?.settings.theme);
  // 语言解析链（src/i18n/localePreference.ts）：服务端设置 > 访客本地覆盖 >
  // 设备语言。i18n 实例在应用入口（src/i18n/index.ts）已按设备语言同步初始化，
  // 此处只在解析链输入变化时校正；useTranslation 订阅 languageChanged——
  // changeLanguage 后本组件重渲染，locale 消费方随之更新。
  const { t } = useTranslation('settings');
  const [override, setOverride] = useState<Locale | null>(null);
  useEffect(() => {
    let alive = true;
    void readLocaleOverride().then((value) => {
      if (alive) setOverride(value);
    });
    return () => {
      alive = false;
    };
  }, []);
  const userLanguage = typeof user?.settings.language === 'string' ? user.settings.language : null;
  useEffect(() => {
    const next = resolveLocale(userLanguage, override, deviceLocale());
    if (i18n.language !== next) void i18n.changeLanguage(next);
  }, [userLanguage, override]);
  const locale = currentLanguage();
  const dark = mode === 'dark' || (mode === 'system' && systemScheme === 'dark');
  const textScale = normalizeTextScale(user?.settings.textScale);
  // 颜色系统由服务端（auth.zhongbei.tech）下发：逐键覆盖内置 tokens；
  // 联机门禁保证进入 App 前必为服务端值，缺省键兜底内置夜色。
  const palette = useMemo<ThemeColors>(
    () => ({
      ...(dark ? { ...colors, ...semantic } : { ...lightColors, ...semanticLight }),
      ...config.theme,
    }),
    [dark, config.theme],
  );
  applyTheme(palette, textScale);
  const value: PreferencesValue = {
    locale,
    mode,
    dark,
    palette,
    textScale,
    text: (key) => t(key),
  };
  return (
    <PreferencesContext.Provider value={value}>
      {/* 产品强制夜色（tokens 仅暗色一套），状态栏恒为白字；
          跟随系统切到浅色也不反转，避免暗背景上出现深色状态栏文字（issue #4）。 */}
      <StatusBar style="light" />
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error('usePreferences must be used inside PreferencesProvider');
  return value;
}

function normalizeTheme(value: unknown): ThemeMode {
  return value === 'light' || value === 'dark' ? value : 'system';
}

function normalizeTextScale(value: unknown) {
  if (typeof value !== 'number') return 1;
  return Math.min(1.3, Math.max(0.9, value));
}
