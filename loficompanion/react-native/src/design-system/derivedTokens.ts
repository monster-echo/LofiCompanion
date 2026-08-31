import { colors, primitives } from '../theme/tokens';

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

/** doc-08 §11：当前用户卡低透明 achievement 边框 = lamp.500 的 45% */
export const achievementBorder = withAlpha(primitives.lamp[500], 0.45);

/** 媒体上的图标按钮底 = night.950 的 35% 透明底（保证纸白图标对比，doc-07 §5） */
export const mediaControl = withAlpha(primitives.night[950], 0.35);

/** doc-08 §11 前三名次圆片（低饱和旧金/雾银/木铜，无领奖台、无大面积金色） */
export type RankAccentTone = 'gold' | 'silver' | 'bronze';

export const rankAccentColors: Record<RankAccentTone, string> = {
  gold: primitives.lamp[500], // 旧金（lamp.500 调）
  silver: primitives.mist[300], // 雾银
  bronze: colors.membershipBronze, // 木铜（低饱和）
};

export const rankAccentSoft: Record<RankAccentTone, string> = {
  gold: withAlpha(primitives.lamp[500], 0.16),
  silver: withAlpha(primitives.mist[300], 0.16),
  bronze: withAlpha(colors.membershipBronze, 0.16),
};

// AppButton 禁用容器：brand 70% over canvas 的等效实色（整体 46% 透明在深色下
// 对背景仅 2.15:1，低于 doc-09 §7 可操作图形 3:1 下限；doc-07 0.45 值基于旧浅色主题）。
export const disabledContainer = '#3A6AAD';
