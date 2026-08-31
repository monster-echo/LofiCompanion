import { describe, expect, it } from 'vitest';
import * as tokens from './tokens';

const { colors, darkColors, primitives, semantic } = tokens;
const typeScale = tokens.type;

describe('doc-07 §4.1 原语', () => {
  it('与文档原语表逐项一致', () => {
    expect(primitives).toEqual({
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
    });
  });
});

describe('doc-07 §4.2 语义映射', () => {
  it('与文档语义表逐项一致', () => {
    expect(semantic).toEqual({
      canvas: '#091522',
      canvasDeep: '#06101C',
      surface: '#0D1B2B',
      surfaceRaised: '#122338',
      surfaceInset: '#06101C',
      textPrimary: '#F3EFE7',
      textSecondary: '#B4BECA',
      textMuted: '#7E8A99',
      actionPrimary: '#4F8FE8',
      actionPressed: '#3E79C9',
      actionFocus: '#6EA6F2',
      onAction: '#FFFFFF',
      achievement: '#D7A85F',
      success: '#63BF94',
      danger: '#D66C72',
      borderSoft: 'rgba(243,239,231,0.08)',
      borderStandard: 'rgba(243,239,231,0.12)',
      borderEmphasis: 'rgba(110,166,242,0.50)',
      scrimTop: 'rgba(6,16,28,0.62)',
      scrimBottom: 'rgba(6,16,28,0.88)',
    });
  });

  it('关键语义锚点', () => {
    expect(semantic.actionPrimary).toBe('#4F8FE8');
    expect(semantic.borderEmphasis).toBe('rgba(110,166,242,0.50)');
  });
});

describe('doc-07 §6.2 字级', () => {
  const expected = {
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
  };

  it('10 个字级令牌与文档一致', () => {
    expect(Object.keys(typeScale).sort()).toEqual(Object.keys(expected).sort());
    expect(typeScale).toEqual(expected);
  });

  it('displayTimer 与 micro 锚点', () => {
    expect(typeScale.displayTimer).toEqual({ fontSize: 56, lineHeight: 64, fontWeight: '600' });
    expect(typeScale.micro).toEqual({ fontSize: 11, lineHeight: 15, fontWeight: '500' });
  });
});

describe('colors 夜色取值', () => {
  it('语义替换后的取值', () => {
    expect(colors.background).toBe('#091522');
    expect(colors.surface).toBe('#0D1B2B');
    expect(colors.surfaceRaised).toBe('#122338');
    expect(colors.surfaceMuted).toBe('#06101C');
    expect(colors.text).toBe('#F3EFE7');
    expect(colors.textSecondary).toBe('#B4BECA');
    expect(colors.border).toBe('rgba(243,239,231,0.08)');
    expect(colors.brand).toBe('#4F8FE8');
    expect(colors.brandPressed).toBe('#3E79C9');
    expect(colors.brandSoft).toBe('rgba(79,143,232,0.16)');
    expect(colors.success).toBe('#63BF94');
    expect(colors.warning).toBe('#D6A556');
    expect(colors.error).toBe('#D66C72');
    expect(colors.info).toBe('#6EA6F2');
    expect(colors.scrim).toBe('rgba(6,16,28,0.88)');
  });

  it('键集不变（既有页面可编译）', () => {
    const legacyKeys = [
      'background', 'surface', 'surfaceRaised', 'surfaceMuted', 'text', 'textSecondary', 'border',
      'brand', 'brandPressed', 'brandSoft', 'success', 'warning', 'warningSoft',
      'error', 'info', 'membershipBronze', 'membershipSilver', 'membershipGold', 'scrim',
    ];
    expect(Object.keys(colors).sort()).toEqual([...legacyKeys].sort());
  });

  it('darkColors 键集与 colors 深度相等', () => {
    expect(Object.keys(darkColors).sort()).toEqual(Object.keys(colors).sort());
    expect(darkColors).toEqual(colors);
  });

  it('会员色为三种可区分的低饱和中性金属色', () => {
    const metals = [colors.membershipBronze, colors.membershipSilver, colors.membershipGold];
    expect(new Set(metals).size).toBe(3);
    for (const hex of metals) expect(hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });
});

describe('doc-07 §7 间距与圆角', () => {
  it('间距保留 x1..x8 并新增 x10/x12', () => {
    expect(tokens.spacing).toEqual({
      x1: 4, x2: 8, x3: 12, x4: 16, x5: 20, x6: 24, x8: 32, x10: 40, x12: 48,
    });
    expect(tokens.space).toBe(tokens.spacing);
  });

  it('radius.small 10→8，其余保持', () => {
    expect(tokens.radii).toEqual({ small: 8, control: 12, card: 16, sheet: 24, round: 999 });
  });
});
