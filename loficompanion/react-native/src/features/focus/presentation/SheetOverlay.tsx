import React, { ReactNode, useEffect, useRef } from "react";
import {
  Animated,
  BackHandler,
  Easing,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { radii, semantic } from "../../../theme/tokens";

export type SheetOverlayProps = Readonly<{
  /** 遮罩点击 / Android 返回时的关闭回调 */
  onClose: () => void;
  /** 关闭按钮无障碍标签（如「再坚持一下」） */
  closeLabel?: string;
  /** 减少动态：取消位移，只保留 100ms opacity（doc-07 §10） */
  reducedMotion?: boolean;
  /** 独立窗口层（RN Modal）内使用：追加底部安全区内边距（外层无 SafeAreaView 垫充时必传） */
  bottomInset?: number;
  /** 面板锚定边：bottom（默认）= 底部上滑面板；top = 顶部下拉面板（圆角/描边/位移方向随之镜像） */
  anchor?: "top" | "bottom";
  /** anchor="top" 时：追加顶部安全区内边距（Modal 内无 SafeAreaView 垫充时必传） */
  topInset?: number;
  children: ReactNode;
}>;

const ENTER_MS = 260; // doc-07 §10 底部 sheet：垂直 24dp + opacity
const REDUCED_MS = 100;
const ENTER_OFFSET = 24;

// RN 0.86 已移除 StyleSheet.absoluteFillObject，统一用显式填充
const absoluteFill = {
  position: "absolute" as const,
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
};

/**
 * 底部 sheet 通用壳（doc-08 §4/S03 与 §21 confirm sheet 共用结构）：
 * 全屏遮罩 + 底部圆角面板（max-h 72%、拖拽柄 36×4），入场 260ms 位移+淡化，
 * Android 返回与遮罩点击统一走 onClose。内容与 CTA 由调用方排布。
 * anchor="top" 时镜像为顶部下拉面板（无拖拽柄，位移自上而下）。
 */
export function SheetOverlay({
  onClose,
  closeLabel = "关闭",
  reducedMotion = false,
  bottomInset = 0,
  anchor = "bottom",
  topInset = 0,
  children,
}: SheetOverlayProps) {
  const enter = useRef(new Animated.Value(0)).current;
  const top = anchor === "top";

  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: reducedMotion ? REDUCED_MS : ENTER_MS,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [enter, reducedMotion]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
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
          top ? styles.sheetTop : styles.sheetBottom,
          {
            opacity: enter,
            transform: [
              {
                translateY: enter.interpolate({
                  inputRange: [0, 1],
                  outputRange: reducedMotion
                    ? [0, 0]
                    : [top ? -ENTER_OFFSET : ENTER_OFFSET, 0],
                }),
              },
            ],
          },
          // 安全区跟随调用方（doc-07 §7.1 固定 12 + 传入 insets）
          !top && bottomInset > 0 ? { paddingBottom: 12 + bottomInset } : null,
          top && topInset > 0 ? { paddingTop: 12 + topInset } : null,
        ]}
      >
        {!top ? <View style={styles.handle} /> : null}
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
    position: "absolute",
    left: 0,
    right: 0,
    maxHeight: "72%",
    backgroundColor: semantic.surface,
    paddingTop: 8,
    paddingHorizontal: 20,
    paddingBottom: 12, // doc-07 §7.1：底部固定 CTA 与安全区 12（安全区由外层 SafeArea 承担）
  },
  sheetBottom: {
    bottom: 0,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: semantic.borderStandard,
  },
  sheetTop: {
    top: 0,
    borderBottomLeftRadius: radii.sheet,
    borderBottomRightRadius: radii.sheet,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: semantic.borderStandard,
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: radii.round,
    backgroundColor: semantic.borderStandard,
    marginBottom: 12,
  },
});
