import type { Locale } from '../i18n/core';

/**
 * 语言解析链（纯函数，node 可测）：登录用户服务端设置 > 访客本地覆盖 >
 * 设备语言。服务端只认 'zh-CN' | 'en-US' 两个原值，其他/缺失即跳过；
 * 设备语言由调用方经 deviceLocale() 折算后传入（本文件保持零 expo 导入）。
 */
export function resolveLocale(
  userLanguage: string | null | undefined,
  override: Locale | null,
  device: Locale,
): Locale {
  if (userLanguage === 'zh-CN' || userLanguage === 'en-US') return userLanguage;
  return override ?? device;
}
