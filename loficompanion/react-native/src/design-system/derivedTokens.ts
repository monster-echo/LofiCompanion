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

/**
 * 媒体暗玻璃族（与 semantic.mediaGlass 同基底 night.950，主题无关、两模式同值）。
 * 铁律：媒体层表面必须整组使用媒体层 token——固定暗玻璃 + onMedia 固定浅字，
 * 严禁其中任何一项用随主题翻转的 token（3.3 事故：暗玻璃底配主题文字，
 * 亮色模式下翻成墨字压暗底不可读）。
 */

/** 玻璃控件档：圆钮/胶囊/chip/弹幕泡/列表卡进入钮（半透明、透出底层动画） */
export const mediaGlassControl = withAlpha(primitives.night[950], 0.5);

/** 轻纱档：图像横幅上的轻覆盖（比控件档更透，只做可读性垫底） */
export const mediaGlassSoft = withAlpha(primitives.night[950], 0.34);

/** 暗玻璃上的固定浅色 hairline 边框（媒体层专用，不随主题翻转） */
export const mediaBorderSoft = withAlpha(primitives.paper[100], 0.12);

/** 主行动玻璃蓝：全 app 主 CTA 统一底色（rain.500 的 55%）——半透明透出底层
 *  内容、与液态玻璃 tab 同语言。前景规则：压在暗玻璃/scrim 上（首页结果板、
 *  结果 sheet）背后恒暗，用固定浅色 onMedia；压在主题表面（画布/surface 卡）
 *  上玻璃合成浅色（亮色画布上白字仅 ~2:1 不可读），必须用随主题翻转的
 *  textPrimary（暗=纸白同 onMedia，亮=墨字）。 */
export const mediaActionGlass = withAlpha(primitives.rain[500], 0.55);

/** 玻璃蓝 CTA 的固定浅蓝描边（rain.400 的 60%，主题无关，两模式同值） */
export const mediaActionBorder = withAlpha(primitives.rain[400], 0.6);

/** 影像上文字投影三件套（保证浅字压亮部也可读） */
export const mediaTextShadow = {
  textShadowColor: withAlpha(primitives.night[950], 0.45),
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 12,
} as const;

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
