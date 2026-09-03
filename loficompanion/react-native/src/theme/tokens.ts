import type { TextStyle } from 'react-native';

/**
 * doc-07 §4.1 颜色原语 —— 十六进制值只允许出现在这里。
 * 值与 docs/07-VISUAL-DESIGN-SYSTEM.md §4.1 表逐项一致。
 */
/**
 * 600 档 = 亮色语义加深档：暖纸白底上需更深的琥珀/草绿/珊瑚红才能达到
 * 图形 3:1 / 文字 4.5:1 对比；暗色板仍用 300/500 档。雾族 600 为亮色次文字。
 */
export const primitives = {
  night: {
    950: '#06101C',
    900: '#091522',
    850: '#0D1B2B',
    800: '#122338',
    700: '#1B3048',
  },
  rain: { 500: '#4F8FE8', 400: '#6EA6F2', 600: '#3E79C9' },
  lamp: { 500: '#D7A85F', 600: '#B6852F' },
  paper: { 50: '#FAF8F3', 100: '#F3EFE7', 200: '#E7E1D4' },
  mist: { 300: '#B4BECA', 500: '#7E8A99', 600: '#5B6472' },
  leaf: { 500: '#63BF94', 600: '#3F9E74' },
  warning: { 500: '#D6A556', 600: '#A87F1E' },
  danger: { 500: '#D66C72', 600: '#C2454E' },
} as const;

/** doc-07 §4.2 语义映射（暗色）。值须与 docs/07 §4.2 表一致——勿再微调 */
export const semantic = {
  canvas: primitives.night[900],
  canvasDeep: primitives.night[950],
  surface: primitives.night[850],
  surfaceRaised: primitives.night[800],
  surfaceInset: primitives.night[950],
  textPrimary: primitives.paper[100],
  textSecondary: primitives.mist[300],
  textMuted: primitives.mist[500],
  actionPrimary: primitives.rain[500],
  actionPressed: primitives.rain[600],
  actionFocus: primitives.rain[400],
  /** 彩色（主色/危险）实底按钮的前景色——与主色解耦的「其上文字」语义 */
  onAction: '#FFFFFF',
  /** 媒体/影像之上的文字（悬于皮肤海报或其暗色玻璃上）。主题无关——
   *  海报永远是深色构图，文字必须固定浅色，两模式相同，不随亮暗翻转 */
  onMedia: primitives.paper[100],
  onMediaSecondary: primitives.mist[300],
  achievement: primitives.lamp[500],
  success: primitives.leaf[500],
  warning: primitives.warning[500],
  danger: primitives.danger[500],
  borderSoft: 'rgba(243,239,231,0.08)',
  borderStandard: 'rgba(243,239,231,0.12)',
  borderEmphasis: 'rgba(110,166,242,0.50)',
  /** 禁用态主操作底色（原 derivedTokens.disabledContainer 字面量升级） */
  actionDisabled: '#3A6AAD',
  scrimTop: 'rgba(6,16,28,0.62)',
  scrimBottom: 'rgba(6,16,28,0.88)',
  /** 影像之上的暗玻璃底（输入条/玻璃按钮等媒体 chrome）。主题无关——
   *  海报永远是深色构图，两模式同值，不随亮暗翻转 */
  mediaGlass: 'rgba(12,14,20,0.62)',
} as const;

/**
 * doc-07 §4.2 语义映射（亮色·暖纸白）：明亮暖纸为底、墨色文字、品牌雨蓝不变。
 * 纸面取「提亮档」字面值（比原语 paper 族更亮——亮色纸感独立色阶）；琥珀/草绿/
 * 珊瑚红取 600 加深档保证亮底对比；onMedia/onMediaSecondary 与暗色同值（主题无关）。
 * scrimTop/scrimBottom 与暗色一致——它们压在皮肤影像之上，属主题无关层。
 */
export const semanticLight = {
  canvas: '#F7F2E9',
  canvasDeep: '#EFE7D8',
  surface: '#FBF8F2',
  surfaceRaised: '#FFFFFF',
  surfaceInset: '#EFE7D8',
  textPrimary: '#10161F',
  textSecondary: primitives.mist[600],
  textMuted: primitives.mist[500],
  actionPrimary: primitives.rain[500],
  actionPressed: primitives.rain[600],
  actionFocus: primitives.rain[400],
  onAction: '#FFFFFF',
  onMedia: primitives.paper[100],
  onMediaSecondary: primitives.mist[300],
  achievement: primitives.lamp[600],
  success: primitives.leaf[600],
  warning: primitives.warning[600],
  danger: primitives.danger[600],
  borderSoft: 'rgba(16,22,31,0.14)',
  borderStandard: 'rgba(16,22,31,0.20)',
  borderEmphasis: 'rgba(79,143,232,0.55)',
  actionDisabled: 'rgba(79,143,232,0.35)',
  scrimTop: 'rgba(6,16,28,0.62)',
  scrimBottom: 'rgba(6,16,28,0.88)',
  mediaGlass: 'rgba(12,14,20,0.62)',
} as const;

/**
 * 既有屏幕消费的旧键名调色板。键集不可变更（编译契约），
 * 取值已按 doc-07 §4.2 语义替换为夜色值。
 */
/** 键集契约（编译期锁定，暗/亮两套必须一致）；值=每键独立可覆写 */
export type LegacyKey =
  | 'background' | 'surface' | 'surfaceRaised' | 'surfaceMuted'
  | 'text' | 'textSecondary' | 'border' | 'brand' | 'brandPressed'
  | 'brandSoft' | 'success' | 'successSoft' | 'warning' | 'warningSoft'
  | 'error' | 'info' | 'membershipBronze' | 'membershipSilver'
  | 'membershipGold' | 'scrim';

export type SemanticColors = Readonly<{ [K in keyof typeof semantic]: string }>;

function makeLegacy(sem: SemanticColors, softBrand: string, softSuccess: string, softWarning: string): Record<LegacyKey, string> {
  return {
    background: sem.canvas,
    surface: sem.surface,
    // 新增键（随服务端 theme 色板扩展，additive 不破坏既有消费方）
    surfaceRaised: sem.surfaceRaised,
    surfaceMuted: sem.surfaceInset,
    text: sem.textPrimary,
    textSecondary: sem.textSecondary,
    border: sem.borderSoft,
    brand: sem.actionPrimary,
    brandPressed: sem.actionPressed,
    brandSoft: softBrand,
    success: sem.success,
    successSoft: softSuccess,
    warning: sem.warning,
    warningSoft: softWarning,
    error: sem.danger,
    info: sem.actionFocus,
    membershipBronze: '#A97E5C',
    membershipSilver: '#9AA4B2',
    membershipGold: '#C9A45C',
    scrim: sem.scrimBottom,
  };
}

export const colors: Readonly<Record<LegacyKey, string>> =
  makeLegacy(semantic, 'rgba(79,143,232,0.16)', 'rgba(99,191,148,0.16)', 'rgba(214,165,86,0.16)');

/** 亮色旧键调色板（暖纸白） */
export const lightColors: Readonly<Record<LegacyKey, string>> = {
  ...makeLegacy(semanticLight, 'rgba(79,143,232,0.12)', 'rgba(99,191,148,0.20)', 'rgba(214,165,86,0.18)'),
  // 亮底信息图标色需加深（rain.500 达 3:1 图形对比），不能用 actionFocus 浅蓝
  info: primitives.rain[500],
};

/** 兼容导出：暗色即默认 colors（既有 import darkColors 的消费方不动） */
export const darkColors = colors;

export type ThemeColors = Readonly<{
  [Key in keyof typeof colors | keyof typeof semantic | keyof typeof semanticLight]: string;
}>;

export const membershipAccents = [
  colors.membershipBronze,
  colors.membershipSilver,
  colors.membershipGold,
] as const;

/** doc-07 §7.1 间距（基础单位 4dp） */
export const spacing = {
  x1: 4,
  x2: 8,
  x3: 12,
  x4: 16,
  x5: 20,
  x6: 24,
  x8: 32,
  x10: 40,
  x12: 48,
} as const;

/** doc-07 §7.1 命名别名（space.1=4 … space.12=48） */
export const space = spacing;

/** doc-07 §7.2 圆角 */
export const radii = {
  small: 8,
  control: 12,
  card: 16,
  sheet: 24,
  round: 999,
} as const;

/** doc-07 §6.2 字级（字号/行高/字重），供组件以 TextStyle 消费 */
export const type = {
  displayTimer: { fontSize: 56, lineHeight: 64, fontWeight: '600' },
  displayMetric: { fontSize: 36, lineHeight: 42, fontWeight: '600' },
  title1: { fontSize: 24, lineHeight: 32, fontWeight: '600' },
  title2: { fontSize: 20, lineHeight: 28, fontWeight: '600' },
  title3: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  caption: { fontSize: 12, lineHeight: 17, fontWeight: '400' },
  micro: { fontSize: 11, lineHeight: 15, fontWeight: '500' },
} satisfies Record<string, TextStyle>;
