import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { semantic } from '../theme/tokens';

export type CompletionBurstProps = Readonly<{
  /** 置位时播放一次绽放（归零瞬间）；复位后停在上帧（组件随导航卸载） */
  visible: boolean;
  /** 减少动态：不渲染光环（画面本身直切完成态） */
  reducedMotion?: boolean;
}>;

const RING_SIZE = 240;
const GROW_MS = 600;
const GROW_TO = 1.5;
const FADE_MS = 300;
const SECOND_RING_DELAY_MS = 180;

/**
 * 完成绽放（S06 归零瞬间）：以画面为中心的双圈光环——专注收束的仪式感，
 * 与 completed 单次动作视频叠化同步播放。纯展示层（pointerEvents none），
 * 盖在媒体之上、控件 chrome 之下，不拦截任何触摸。
 */
export function CompletionBurst({ visible, reducedMotion = false }: CompletionBurstProps) {
  const ring1 = useRef(new Animated.Value(0.6)).current;
  const ring1Opacity = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0.6)).current;
  const ring2Opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible || reducedMotion) return;
    const bloom = (scale: Animated.Value, opacity: Animated.Value) =>
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale, {
            toValue: GROW_TO,
            duration: GROW_MS,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.85,
            duration: GROW_MS * 0.4,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true }),
      ]);
    Animated.parallel([
      bloom(ring1, ring1Opacity),
      Animated.sequence([Animated.delay(SECOND_RING_DELAY_MS), bloom(ring2, ring2Opacity)]),
    ]).start();
  }, [visible, reducedMotion, ring1, ring1Opacity, ring2, ring2Opacity]);

  if (!visible || reducedMotion) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={styles.center}>
        <Animated.View
          style={[styles.ring, { transform: [{ scale: ring1 }], opacity: ring1Opacity }]}
        />
        <Animated.View
          style={[styles.ring, { transform: [{ scale: ring2 }], opacity: ring2Opacity }]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 2,
    // 品牌雨蓝亮档：暗色媒体构图上的庆祝色（actionFocus 两模式同值）
    borderColor: semantic.actionFocus,
  },
});
