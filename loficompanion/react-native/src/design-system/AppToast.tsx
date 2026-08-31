import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { BaseToastProps } from 'react-native-toast-message';
import Toast from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePreferences } from '../preferences/PreferencesProvider';
import { AppIcon, IconName } from './AppIcon';
import { ThemeColors, radii, space, type } from '../theme/tokens';

/**
 * 全局 Toast（react-native-toast-message 承载）：默认出现在 App 顶部、
 * safe-area 之下，色调图标随 success/error/info 变化；样式消费服务端色板。
 * 展示由 useApp().toast 驱动（FeedbackHost 负责 Toast.show），本组件只提供
 * 顶部挂载点与渲染配置。
 */

/** docs/PRODUCT_SPEC：Toast 默认 2.4 秒，不阻断任务 */
export const TOAST_DURATION_MS = 2400;

type Tone = 'success' | 'info' | 'error';

const TONE_ICON: Record<Tone, IconName> = {
  success: 'check',
  error: 'alert',
  info: 'bell',
};

const TONE_COLOR: Record<Tone, keyof ThemeColors> = {
  success: 'success',
  error: 'error',
  info: 'info',
};

function createToastConfig(palette: ThemeColors): Record<Tone, (props: BaseToastProps) => React.JSX.Element> {
  const render = (tone: Tone) =>
    ({ text1 }: BaseToastProps) => (
      <View
        accessibilityLiveRegion="polite"
        style={[cardStyles.card, { backgroundColor: palette.surfaceRaised, borderColor: palette.border }]}
      >
        <AppIcon name={TONE_ICON[tone]} color={palette[TONE_COLOR[tone]]} size={20} />
        <Text style={[cardStyles.message, { color: palette.text }]} numberOfLines={2}>
          {text1}
        </Text>
      </View>
    );
  return { success: render('success'), error: render('error'), info: render('info') };
}

export function AppToastHost() {
  const { palette } = usePreferences();
  const insets = useSafeAreaInsets();
  const config = useMemo(() => createToastConfig(palette), [palette]);
  return (
    <Toast
      config={config}
      position="top"
      // 顶部 toast 悬挂在状态栏/刘海之下
      topOffset={insets.top + space.x2}
      bottomOffset={space.x10}
    />
  );
}

const cardStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x3,
    minHeight: 52,
    marginHorizontal: space.x4,
    borderRadius: radii.control,
    borderWidth: 1,
    paddingHorizontal: space.x4,
    paddingVertical: space.x3,
  },
  message: {
    ...type.body,
    flexShrink: 1,
  },
});
