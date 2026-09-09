import React, { useRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  PressableProps,
  StyleProp,
  ViewStyle,
} from 'react-native';

export type PressableScaleProps = Omit<PressableProps, 'style' | 'children'> & {
  /** 静态布局样式（按压反馈由本组件的 Animated 层承担，勿再传函数式 pressed 样式） */
  style?: StyleProp<ViewStyle>;
  /** 减少动态：降为 100ms 纯 opacity（与 SheetOverlay 惯例一致），由调用方传入 */
  reducedMotion?: boolean;
  children?: React.ReactNode;
};

const PRESS_MS = 120;
const REDUCED_MS = 100;
const SCALE_PRESSED = 0.98;
const OPACITY_PRESSED = 0.82;

/**
 * 媒体场景按压微动效容器（doc-07 §10 精神）：按压缩放 0.98 + 淡至 0.82，
 * 120ms Easing.out，useNativeDriver。统一此前各屏「style 函数 + pressed
 * 样式切换」的写法——按压语言集中一处、且真动画而非样式跳变。
 * 命中区由外层 Pressable 承担（缩放只作用于视觉层）；无障碍 props 全透传。
 * 规格件 FocusActionBar（doc-07 §7.3 工具条）保留自身实现，见组件注释互链。
 */
export function PressableScale({
  style,
  reducedMotion = false,
  onPressIn,
  onPressOut,
  children,
  ...rest
}: PressableScaleProps) {
  const press = useRef(new Animated.Value(0)).current;
  const animateTo = (toValue: number) =>
    Animated.timing(press, {
      toValue,
      duration: reducedMotion ? REDUCED_MS : PRESS_MS,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();

  return (
    <Pressable
      {...rest}
      onPressIn={(event) => {
        animateTo(1);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        animateTo(0);
        onPressOut?.(event);
      }}
    >
      <Animated.View
        style={[
          style,
          {
            opacity: press.interpolate({ inputRange: [0, 1], outputRange: [1, OPACITY_PRESSED] }),
            transform: [
              {
                scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, SCALE_PRESSED] }),
              },
            ],
          },
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}
