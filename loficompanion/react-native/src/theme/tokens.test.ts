import { describe, expect, it } from 'vitest';
import * as tokens from './tokens';

const { colors, darkColors, lightColors, primitives, semantic, semanticLight } = tokens;
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
      rain: { 500: '#4F8FE8', 400: '#6EA6F2', 600: '#3E79C9' },
      lamp: { 500: '#D7A85F', 600: '#B6852F' },
      paper: { 50: '#FAF8F3', 100: '#F3EFE7', 200: '#E7E1D4' },
      mist: { 300: '#B4BECA', 500: '#7E8A99', 600: '#5B6472' },
      leaf: { 500: '#63BF94', 600: '#3F9E74' },
      warning: { 500: '#D6A556', 600: '#A87F1E' },
      danger: { 500: '#D66C72', 600: '#C2454E' },
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
      onMedia: '#F3EFE7',
      onMediaSecondary: '#B4BECA',
      achievement: '#D7A85F',
      success: '#63BF94',
      warning: '#D6A556',
      danger: '#D66C72',
      borderSoft: 'rgba(243,239,231,0.08)',
      borderStandard: 'rgba(243,239,231,0.12)',
      borderEmphasis: 'rgba(110,166,242,0.50)',
      actionDisabled: '#3A6AAD',
      scrimTop: 'rgba(6,16,28,0.62)',
      scrimBottom: 'rgba(6,16,28,0.88)',
      // 媒体暗玻璃（主题无关，两模式同值）：输入条/玻璃按钮等影像 chrome
      mediaGlass: 'rgba(12,14,20,0.62)',
    });
  });

  it('亮色映射（暖纸白）：明亮纸面、墨色文字、品牌雨蓝不变、状态色取 600 加深档', () => {
    expect(semanticLight).toEqual({
      canvas: '#F7F2E9',
      canvasDeep: '#EFE7D8',
      surface: '#FBF8F2',
      surfaceRaised: '#FFFFFF',
      surfaceInset: '#EFE7D8',
      textPrimary: '#10161F',
      textSecondary: '#5B6472',
      textMuted: '#7E8A99',
      actionPrimary: '#4F8FE8',
      actionPressed: '#3E79C9',
      actionFocus: '#6EA6F2',
      onAction: '#FFFFFF',
      onMedia: '#F3EFE7',
      onMediaSecondary: '#B4BECA',
      achievement: '#B6852F',
      success: '#3F9E74',
      warning: '#A87F1E',
      danger: '#C2454E',
      borderSoft: 'rgba(16,22,31,0.14)',
      borderStandard: 'rgba(16,22,31,0.20)',
      borderEmphasis: 'rgba(79,143,232,0.55)',
      actionDisabled: 'rgba(79,143,232,0.35)',
      scrimTop: 'rgba(6,16,28,0.62)',
      scrimBottom: 'rgba(6,16,28,0.88)',
      mediaGlass: 'rgba(12,14,20,0.62)',
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
    expect(colors.successSoft).toBe('rgba(99,191,148,0.16)');
    expect(colors.warning).toBe('#D6A556');
    expect(colors.error).toBe('#D66C72');
    expect(colors.info).toBe('#6EA6F2');
    expect(colors.scrim).toBe('rgba(6,16,28,0.88)');
  });

  it('键集不变（既有页面可编译）', () => {
    const legacyKeys = [
      'background', 'surface', 'surfaceRaised', 'surfaceMuted', 'text', 'textSecondary', 'border',
      'brand', 'brandPressed', 'brandSoft', 'success', 'successSoft', 'warning', 'warningSoft',
      'error', 'info', 'membershipBronze', 'membershipSilver', 'membershipGold', 'scrim',
    ];
    expect(Object.keys(colors).sort()).toEqual([...legacyKeys].sort());
  });

  it('darkColors 为 colors 同一取值（暗色默认）', () => {
    expect(Object.keys(darkColors).sort()).toEqual(Object.keys(colors).sort());
    expect(darkColors).toEqual(colors);
  });

  it('lightColors 键集与 colors 一致但取值不同（暖纸白）', () => {
    expect(Object.keys(lightColors).sort()).toEqual(Object.keys(colors).sort());
    expect(lightColors).not.toEqual(colors);
    expect(lightColors.background).toBe('#F7F2E9');
    expect(lightColors.text).toBe('#10161F');
    expect(lightColors.surface).toBe('#FBF8F2');
    expect(lightColors.textSecondary).toBe('#5B6472');
    expect(lightColors.successSoft).toBe('rgba(99,191,148,0.20)');
    expect(lightColors.success).toBe('#3F9E74');
    expect(lightColors.error).toBe('#C2454E');
    expect(lightColors.info).toBe('#4F8FE8');
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
