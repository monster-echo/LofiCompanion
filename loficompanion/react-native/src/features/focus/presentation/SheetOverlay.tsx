import React, { ReactNode, useEffect, useRef } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { radii, semantic } from '../../../theme/tokens';

export type SheetOverlayProps = Readonly<{
  /** 遮罩点击 / Android 返回时的关闭回调 */
  onClose: () => void;
  /** 关闭按钮无障碍标签（如「再坚持一下」） */
  closeLabel?: string;
  /** 减少动态：取消位移，只保留 100ms opacity（doc-07 §10） */
  reducedMotion?: boolean;
  children: ReactNode;
}>;

const ENTER_MS = 260; // doc-07 §10 底部 sheet：垂直 24dp + opacity
const REDUCED_MS = 100;
const ENTER_OFFSET = 24;

// RN 0.86 已移除 StyleSheet.absoluteFillObject，统一用显式填充
const absoluteFill = {
  position: 'absolute' as const,
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
};

/**
 * 底部 sheet 通用壳（doc-08 §4/S03 与 §21 confirm sheet 共用结构）：
 * 全屏遮罩 + 底部圆角面板（max-h 72%、拖拽柄 36×4），入场 260ms 位移+淡化，
 * Android 返回与遮罩点击统一走 onClose。内容与 CTA 由调用方排布。
 */
export function SheetOverlay({
  onClose,
  closeLabel = '关闭',
  reducedMotion = false,
  children,
}: SheetOverlayProps) {
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: reducedMotion ? REDUCED_MS : ENTER_MS,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [enter, reducedMotion]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [onClose]);

  return (
    <View style={styles.screen}>
      <Pressable
        accessibilityLabel={closeLabel}
        accessibilityRole="button"
        style={styles.backdrop}
        onPress={onClose}
      />
      <Animated.View
        style={[
          styles.sheet,
          {
            opacity: enter,
            transform: [
              {
                translateY: enter.interpolate({
                  inputRange: [0, 1],
                  outputRange: reducedMotion ? [0, 0] : [ENTER_OFFSET, 0],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.handle} />
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  backdrop: {
    ...absoluteFill,
    backgroundColor: semantic.scrimBottom,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '72%',
    backgroundColor: semantic.surface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: semantic.borderStandard,
    paddingTop: 8,
    paddingHorizontal: 20,
    paddingBottom: 12, // doc-07 §7.1：底部固定 CTA 与安全区 12（安全区由外层 SafeArea 承担）
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: radii.round,
    backgroundColor: semantic.borderStandard,
    marginBottom: 12,
  },
});
