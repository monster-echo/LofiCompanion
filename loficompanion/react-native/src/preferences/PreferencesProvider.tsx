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
import { readLocaleOverride, readThemeOverride, saveThemeOverride } from '../data/storage';
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
  // 主题解析链（与语言同构）：服务端 user.settings.theme > 访客本地覆盖 >
  // system。登录页必然 user=null——主题偏好若只挂服务端，登出/冷启动时会
  // 塌缩回 system，登录页跟随系统亮暗（issue：dark 模式登录页是 light）。
  const serverTheme = normalizeTheme(user?.settings.theme);
  const [themeOverride, setThemeOverride] = useState<ThemeMode | null>(null);
  useEffect(() => {
    let alive = true;
    void readThemeOverride().then((value) => {
      if (alive) setThemeOverride(value);
    });
    return () => {
      alive = false;
    };
  }, []);
  // 服务端主题到位后镜像写本地覆盖：登出后登录页沿用最后选择的主题。
  useEffect(() => {
    if (serverTheme) void saveThemeOverride(serverTheme);
  }, [serverTheme]);
  const mode = serverTheme ?? themeOverride ?? 'system';
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
  // 颜色系统由服务端（auth.zhongbei.tech）下发；联机门禁保证进入 App 前必为
  // 服务端值。服务端色板是「暗色基线」（auth 服务保存 doc-07 夜景值），只覆盖
  // 暗色；亮色用内置暖纸白板——否则整套暗值（background #091522 / text #F3EFE7
  // …）会污染亮底（Phase 3.3 回归）。
  const palette = useMemo<ThemeColors>(
    () => ({
      ...(dark ? { ...colors, ...semantic, ...config.theme } : { ...lightColors, ...semanticLight }),
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
      {/* 亮暗双主题：状态栏前景随调色板反转（亮底深字/暗底亮字） */}
      <StatusBar style={dark ? 'light' : 'dark'} />
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error('usePreferences must be used inside PreferencesProvider');
  return value;
}

// 未知/缺失值返回 null（走本地覆盖链）；显式 'system' 是合法服务端值——
// 用户明确选择跟随系统时必须生效，不能被旧本地覆盖劫持。
function normalizeTheme(value: unknown): ThemeMode | null {
  return value === 'light' || value === 'dark' || value === 'system' ? value : null;
}

function normalizeTextScale(value: unknown) {
  if (typeof value !== 'number') return 1;
  return Math.min(1.3, Math.max(0.9, value));
}
