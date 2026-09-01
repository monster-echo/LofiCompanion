import * as Localization from 'expo-localization';

import { normalizeLocale, type Locale } from './core';

// 全仓库唯一导入 expo-localization 的模块：把设备语言折叠成受支持 Locale。
// 其他代码需要设备语言时一律经 PreferencesProvider 的 locale 或 resolveLocale。

export function deviceLocale(): Locale {
  const tag = Localization.getLocales()[0]?.languageTag;
  return normalizeLocale(tag);
}
