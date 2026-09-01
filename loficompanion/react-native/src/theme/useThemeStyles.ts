import { useMemo } from 'react';
import { StyleSheet, TextStyle, ViewStyle, ImageStyle } from 'react-native';

import { ThemeColors } from './tokens';
import { usePreferences } from '../preferences/PreferencesProvider';

/**
 * 调色板响应式样式工厂：模块顶层定义 makeStyles(palette, textScale)
 * （稳定函数标识），组件内 const styles = useThemeStyles(makeStyles)。
 * 结果按 palette/textScale 身份 memo——同一主题下引用稳定，满足 RN
 * StyleSheet 缓存语义；切主题时重建一次。
 */
export function useThemeStyles<T extends Record<string, TextStyle | ViewStyle | ImageStyle>>(
  makeStyles: (palette: ThemeColors, textScale: number) => T,
): T {
  const { palette, textScale } = usePreferences();
  return useMemo(() => StyleSheet.create(makeStyles(palette, textScale)), [makeStyles, palette, textScale]);
}
