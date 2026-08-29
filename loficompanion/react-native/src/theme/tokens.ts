import type { TextStyle } from 'react-native';

/**
 * doc-07 §4.1 颜色原语 —— 十六进制值只允许出现在这里。
 * 值与 docs/07-VISUAL-DESIGN-SYSTEM.md §4.1 表逐项一致。
 */
export const primitives = {
  night: {
    950: '#06101C',
    900: '#091522',
    850: '#0D1B2B',
    800: '#122338',
    700: '#1B3048',
  },
  rain: { 500: '#4F8FE8', 400: '#6EA6F2' },
  lamp: { 500: '#D7A85F' },
  paper: { 100: '#F3EFE7' },
  mist: { 300: '#B4BECA', 500: '#7E8A99' },
  leaf: { 500: '#63BF94' },
  warning: { 500: '#D6A556' },
  danger: { 500: '#D66C72' },
} as const;

/** doc-07 §4.2 语义映射（暗色） */
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
  actionPressed: '#3E79C9',
  actionFocus: primitives.rain[400],
  achievement: primitives.lamp[500],
  success: primitives.leaf[500],
  danger: primitives.danger[500],
  borderSoft: 'rgba(243,239,231,0.08)',
  borderStandard: 'rgba(243,239,231,0.12)',
  borderEmphasis: 'rgba(110,166,242,0.50)',
  scrimTop: 'rgba(6,16,28,0.62)',
  scrimBottom: 'rgba(6,16,28,0.88)',
} as const;

/**
 * 既有屏幕消费的旧键名调色板。键集不可变更（编译契约），
 * 取值已按 doc-07 §4.2 语义替换为夜色值。
 */
export const colors = {
  background: semantic.canvas,
  surface: semantic.surface,
  surfaceMuted: semantic.surfaceInset,
  text: semantic.textPrimary,
  textSecondary: semantic.textSecondary,
  border: semantic.borderSoft,
  brand: semantic.actionPrimary,
  brandPressed: semantic.actionPressed,
  brandSoft: 'rgba(79,143,232,0.16)',
  success: semantic.success,
  warning: primitives.warning[500],
  warningSoft: 'rgba(214,165,86,0.16)',
  error: semantic.danger,
  info: semantic.actionFocus,
  membershipBronze: '#A97E5C',
  membershipSilver: '#9AA4B2',
  membershipGold: '#C9A45C',
  scrim: semantic.scrimBottom,
} as const;

/** 产品为暗色单主题：两套调色板取值一致，外观切换保持可用。 */
export const darkColors = { ...colors } as const;

export type ThemeColors = Readonly<{
  [Key in keyof typeof colors]: string;
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
