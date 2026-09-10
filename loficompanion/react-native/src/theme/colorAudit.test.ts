import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 颜色审计（doc-07 §4.1「十六进制值只允许出现在 tokens.ts」的机械化看守）。
 * 遍历 src/**\/*.{ts,tsx}（剥离注释后扫描），断言白名单之外的文件不出现
 * 十六进制/rgba 颜色字面量——UI 颜色必须来自 theme token 或 derivedTokens
 * 派生。新增硬编码会让本测试变红，防止审计清零后回潮。
 */

/** token 定义层与生成物豁免（它们就是颜色的唯一合法来源/产物） */
const ALLOWLIST_FILES = [
  'src/theme/tokens.ts',
  'src/design-system/derivedTokens.ts',
];

/** 数据层豁免：非 UI 样式、有外部契约的颜色字面量 */
const ALLOWLIST_VALUES = new Set([
  // Google 品牌登录图标官方四色（品牌色惯例，非主题色）
  '#4285F4', '#34A853', '#FBBC05', '#EA4335',
  // embeddedConfig 套餐 accent 兜底值（镜像 biz-server 套餐配置数据）
  '#667085',
]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (/\.(tsx?|js|mjs)$/.test(name) && !name.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** 剥离块注释与行注释（避免说明文字里的色值示例误报） */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

describe('颜色审计：src 内无白名单外的硬编码颜色', () => {
  it('十六进制/rgba 字面量只出现在 token 定义层与豁免数据里', () => {
    const srcRoot = join(__dirname, '..');
    const offenders: string[] = [];
    for (const file of walk(srcRoot)) {
      const rel = file.slice(srcRoot.length - 'src'.length);
      const normalized = rel.startsWith('/') ? rel.slice(1) : rel;
      if (ALLOWLIST_FILES.includes(normalized)) continue;
      if (/\.generated\./.test(normalized)) continue;
      const source = stripComments(readFileSync(file, 'utf8'));
      const hexMatches = source.match(/#[0-9A-Fa-f]{6}\b/g) ?? [];
      const rgbaMatches = source.match(/rgba?\(/g) ?? [];
      if (hexMatches.length === 0 && rgbaMatches.length === 0) continue;
      const badHex = hexMatches.filter((hex) => !ALLOWLIST_VALUES.has(hex.toUpperCase()));
      if (badHex.length > 0 || rgbaMatches.length > 0) {
        offenders.push(
          `${normalized}: ${badHex.length > 0 ? badHex.join(', ') : ''}` +
          `${rgbaMatches.length > 0 ? `${badHex.length > 0 ? ' + ' : ''}rgba() × ${rgbaMatches.length}` : ''}`,
        );
      }
    }
    expect(
      offenders,
      '以下文件存在白名单外的硬编码颜色，请改用 theme token 或 derivedTokens 派生：\n' +
      offenders.join('\n'),
    ).toEqual([]);
  });
});
