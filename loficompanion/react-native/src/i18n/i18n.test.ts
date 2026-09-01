import { describe, expect, it } from 'vitest';
import { createInstance } from 'i18next';

import { FALLBACK_LOCALE, normalizeLocale, initOptions, type Locale } from './core';
import { resources } from './resources';
import { resolveLocale } from './localePreference';

// i18n 核心守护：标签归一化、en-US 兜底、双语键集 parity（防 73 文件
// 迁移漂移的静态门禁）、语言解析链优先级。

function createTestI18n(lng: string) {
  const instance = createInstance();
  instance.init(initOptions(lng, resources));
  return instance;
}

describe('normalizeLocale', () => {
  it('passes through supported locales', () => {
    expect(normalizeLocale('zh-CN')).toBe('zh-CN');
    expect(normalizeLocale('en-US')).toBe('en-US');
  });

  it('folds regional variants onto supported locales', () => {
    expect(normalizeLocale('zh-TW')).toBe('zh-CN');
    expect(normalizeLocale('zh-HK')).toBe('zh-CN');
    expect(normalizeLocale('en-GB')).toBe('en-US');
    expect(normalizeLocale('ZH-cn')).toBe('zh-CN');
  });

  it('falls back to en-US for unknown/missing tags', () => {
    expect(normalizeLocale('fr')).toBe('en-US');
    expect(normalizeLocale('')).toBe('en-US');
    expect(normalizeLocale(null)).toBe('en-US');
    expect(normalizeLocale(undefined)).toBe('en-US');
  });

  it('exposes en-US as the fallback locale', () => {
    expect(FALLBACK_LOCALE).toBe('en-US');
  });
});

describe('i18n instance', () => {
  it('resolves the requested language and falls back for unsupported ones', () => {
    const zh = createTestI18n('zh-CN');
    expect(zh.t('settings:language')).toBe('语言');
    expect(zh.t('settings:english')).toBe('English');

    const fr = createTestI18n('fr');
    expect(fr.t('settings:language')).toBe('Language');
    expect(fr.t('settings:nonexistent', { defaultValue: 'D' })).toBe('D');
  });
});

describe('resource parity', () => {
  const zh = resources['zh-CN'] as Record<string, object>;
  const en = resources['en-US'] as Record<string, object>;

  it('registers the same namespaces for both locales', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort());
  });

  function keyPaths(obj: object, prefix = ''): string[] {
    return Object.entries(obj).flatMap(([key, value]) => {
      const path = prefix === '' ? key : `${prefix}.${key}`;
      return typeof value === 'object' && value !== null ? keyPaths(value, path) : [path];
    });
  }

  it('keeps zh-CN and en-US key sets deep-equal in every namespace', () => {
    for (const ns of Object.keys(zh)) {
      expect(keyPaths(en[ns] as object).sort()).toEqual(keyPaths(zh[ns] as object).sort());
    }
  });
});

describe('resolveLocale', () => {
  const device: Locale = 'en-US';
  it('prefers the signed-in user server setting', () => {
    expect(resolveLocale('zh-CN', 'en-US', device)).toBe('zh-CN');
    expect(resolveLocale('en-US', null, 'zh-CN')).toBe('en-US');
  });

  it('ignores unrecognized server values', () => {
    expect(resolveLocale('klingon', 'zh-CN', device)).toBe('zh-CN');
    expect(resolveLocale('', null, device)).toBe(device);
    expect(resolveLocale(null, null, device)).toBe(device);
  });

  it('prefers the guest override over the device locale', () => {
    expect(resolveLocale(null, 'zh-CN', device)).toBe('zh-CN');
    expect(resolveLocale(undefined, null, 'zh-CN')).toBe('zh-CN');
  });
});
