import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 文案审计（与 theme/colorAudit 同思路的机械化看守）：
 * 1. 白名单之外的用户界面代码不得出现中文字符串字面量——所有用户可见文案
 *    必须走 i18n（locales/{zh-CN,en-US}/，键集 parity 由 i18n.test.ts 看守）。
 *    服务端下发内容的渲染期翻译用 data/errorCopy.ts / support/supportCopy.ts /
 *    domain/membershipCopy.ts 这类「登记 id → 键」的映射，不要内联中文。
 * 2. 日期/金额格式化不得硬编码 locale 字符串（如 toLocaleString('zh-CN')）——
 *    必须用 i18n/core 的 currentLanguage() 或 undefined（跟随设备）。
 * 新增硬编码会让本测试变红，防止 i18n 清零后回潮（2026-09 contact support /
 * 隐私政策 / about 串语言问题的根治守卫）。
 */

/** 文案唯一合法来源：locale 资源目录整体豁免 */
const ALLOWLIST_DIRS = ['src/i18n/locales'];

/** 逐文件豁免（每条须写明理由，新增前先想是否有更好的做法） */
const ALLOWLIST_FILES = [
  // zh 权威法务文书本体（en 对照译本同文件维护；服务端未下发英文时的兜底）
  'src/legal/legalDocuments.ts',
  // 服务端配置镜像数据：分类 label 等是离线兜底的原文，渲染层按 id 翻译
  // （support/supportCopy.ts）；tagline/splash 等已由 i18n 接管
  'src/config/embeddedConfig.ts',
  // apiClient 合成的中文 message 是给 zh 用户的原文，同时带 messageKey 供
  // UI 本地化（data/errorCopy.ts）；其余 throw 为开发向错误
  'src/data/apiClient.ts',
  // 开发向 throw / 错误分类正则（用户不可见）
  'src/features/achievements/domain/rules.ts',
  'src/features/skins/application/skinPackController.ts',
  'src/features/skins/data/remoteSkinsRepository.ts',
  'src/features/skins/domain/resolve.ts',
  'src/features/sync/application/SyncStore.tsx',
  'src/design-system/derivedTokens.ts',
  // CJK 检测正则的字符类区间（技术用途，非文案）
  'src/data/errorCopy.ts',
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (/\.(tsx?)$/.test(name) && !name.endsWith('.test.ts') && !name.endsWith('.test.tsx')) {
      out.push(full);
    }
  }
  return out;
}

/** 剥离块注释与行注释（:// 协议前的 : 不算行注释起点，避免截断字符串） */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"\\\w])\/\/[^\n]*/g, '$1');
}

describe('文案审计：src 内无白名单外的硬编码中文与硬编码 locale', () => {
  it('中文字符串字面量只出现在 locale 资源与逐文件豁免名单里', () => {
    const srcRoot = join(__dirname, '..');
    const offenders: string[] = [];
    for (const file of walk(srcRoot)) {
      const normalized = file.slice(srcRoot.length - 'src'.length).replace(/^\//, '');
      if (ALLOWLIST_DIRS.some((dir) => normalized.startsWith(dir))) continue;
      if (ALLOWLIST_FILES.includes(normalized)) continue;
      if (/\.generated\./.test(normalized)) continue; // 生成数据（nameZh/nameEn 成对，渲染层按语言取用）
      const source = stripComments(readFileSync(file, 'utf8'));
      const lines = source.split('\n');
      lines.forEach((line, index) => {
        if (/[一-龥]/.test(line)) {
          offenders.push(`${normalized}:${index + 1}: ${line.trim().slice(0, 80)}`);
        }
      });
    }
    expect(
      offenders,
      '以下文件出现硬编码中文文案，请改走 i18n（键放 locales/{zh-CN,en-US} 并保持 parity）：\n' +
      offenders.join('\n'),
    ).toEqual([]);
  });

  it('日期/金额格式化不硬编码 locale（用 currentLanguage() 或 undefined）', () => {
    const srcRoot = join(__dirname, '..');
    const offenders: string[] = [];
    const patterns: readonly [RegExp, string][] = [
      [/toLocale(String|Date|TimeString)\(\s*['"`]/, 'toLocaleXxx(\'<locale>\')'],
      [/Intl\.NumberFormat\(\s*['"`]/, 'Intl.NumberFormat(\'<locale>\')'],
      [/Intl\.DateTimeFormat\(\s*['"`]/, 'Intl.DateTimeFormat(\'<locale>\')'],
    ];
    for (const file of walk(srcRoot)) {
      const normalized = file.slice(srcRoot.length - 'src'.length).replace(/^\//, '');
      const source = stripComments(readFileSync(file, 'utf8'));
      for (const [pattern, label] of patterns) {
        if (pattern.test(source)) {
          offenders.push(`${normalized}: ${label}`);
        }
      }
    }
    expect(
      offenders,
      '以下文件硬编码了格式化 locale，请改用 i18n/core 的 currentLanguage()：\n' +
      offenders.join('\n'),
    ).toEqual([]);
  });
});
