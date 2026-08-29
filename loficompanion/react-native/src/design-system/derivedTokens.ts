import { primitives } from '../theme/tokens';

/**
 * 语义令牌之外的派生色（tokens.ts 的键集被测试钉死为 doc-07 §4.2 表，
 * 不得增删；这里只从原语推导，组件层不出现十六进制字面量）。
 */

/** 仅接受 tokens 原语里的 7 位 '#RRGGBB'，换算为 'rgba(r,g,b,a)' */
function withAlpha(hex: string, alpha: number): string {
  if (hex.length !== 7 || hex.charAt(0) !== '#') {
    throw new Error(`withAlpha 只接受 6 位十六进制原语：${hex}`);
  }
  const value = Number.parseInt(hex.slice(1), 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red},${green},${blue},${alpha})`;
}

/** doc-07 §5：媒体上的卡片 = night.900 的 88% 不透明底 */
export const mediaSurface = withAlpha(primitives.night[900], 0.88);

/** 成就强调行软底 = lamp.500（achievement）的 16% 透明底 */
export const achievementSoft = withAlpha(primitives.lamp[500], 0.16);
