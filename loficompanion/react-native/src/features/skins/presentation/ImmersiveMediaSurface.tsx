import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  LayoutChangeEvent,
  StyleSheet,
  View,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { stateAsset } from '../domain/resolve';
import type { CompanionState, SkinManifest, SkinStateAsset } from '../domain/types';
import { semantic } from '../../../theme/tokens';

export type ImmersiveMediaSurfaceProps = Readonly<{
  manifest: SkinManifest;
  state: CompanionState;
  /** doc-07 §9.2：容器 cover，不拉伸 */
  resizeMode?: 'cover' | 'contain';
  /** 减少动态：状态切换不做 150ms 交叉淡化，直接换海报（doc-07 §10） */
  reducedMotion?: boolean;
}>;

// doc-07 §9.3 叠层：顶部约 136dp（scrimTop→透明），底部约 260dp（透明→scrimBottom）
const TOP_SCRIM_HEIGHT = 136;
const BOTTOM_SCRIM_HEIGHT = 260;
const CROSSFADE_MS = 150;
/** 小屏裁切放大倍率：围绕焦点取景的可接受简化（doc-07 §9.2） */
const FOCAL_ZOOM = 1.15;

let gradientSeq = 0;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// RN 0.86 已移除 StyleSheet.absoluteFillObject，统一用显式填充
const absoluteFill = {
  position: 'absolute' as const,
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
};

/**
 * doc-07 §9 沉浸媒体面：全屏/大面积状态海报，cover 取景、围绕 manifest
 * 焦点构图；顶部/底部渐暗叠层；状态切换 150ms 交叉淡化（两层堆叠海报）。
 * 纯渲染组件——不持有播放状态，仅随 props 变化做视觉过渡。
 */
export function ImmersiveMediaSurface({
  manifest,
  state,
  resizeMode = 'cover',
  reducedMotion = false,
}: ImmersiveMediaSurfaceProps) {
  const gradientIds = useMemo(() => {
    gradientSeq += 1;
    const seq = gradientSeq;
    return { top: `media-scrim-top-${seq}`, bottom: `media-scrim-bottom-${seq}` };
  }, []);

  const [layout, setLayout] = useState<{ width: number; height: number } | null>(null);
  const [layers, setLayers] = useState<{ current: SkinStateAsset; previous: SkinStateAsset | null }>(
    () => ({ current: stateAsset(manifest, state), previous: null }),
  );
  const currentRef = useRef(layers.current);
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const next = stateAsset(manifest, state);
    const prev = currentRef.current;
    if (prev.poster === next.poster) {
      currentRef.current = next;
      setLayers({ current: next, previous: null });
      return;
    }
    currentRef.current = next;
    if (reducedMotion) {
      setLayers({ current: next, previous: null });
      return;
    }
    setLayers({ current: next, previous: prev });
    fade.setValue(0);
    Animated.timing(fade, {
      toValue: 1,
      duration: CROSSFADE_MS,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setLayers((latest) =>
          latest.current === next ? { current: next, previous: null } : latest,
        );
      }
    });
  }, [manifest, state, reducedMotion, fade]);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setLayout((prev) =>
      prev && Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1
        ? prev
        : { width, height },
    );
  };

  // 焦点取景：图像放大 1.15×，把焦点平移到容器中心并夹紧边缘
  const frame = (() => {
    if (!layout) return null;
    const width = layout.width * FOCAL_ZOOM;
    const height = layout.height * FOCAL_ZOOM;
    const left = clamp(
      layout.width / 2 - layers.current.focalPointX * width,
      layout.width - width,
      0,
    );
    const top = clamp(
      layout.height / 2 - layers.current.focalPointY * height,
      layout.height - height,
      0,
    );
    return { width, height, left, top };
  })();

  const imageStyle = frame
    ? { position: 'absolute' as const, width: frame.width, height: frame.height, left: frame.left, top: frame.top }
    : absoluteFill;

  return (
    <View
      style={styles.container}
      onLayout={onLayout}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {layers.previous ? (
        <Image source={layers.previous.poster} style={absoluteFill} resizeMode={resizeMode} />
      ) : null}
      <Animated.View
        style={[
          absoluteFill,
          layers.previous ? { opacity: fade } : null,
        ]}
      >
        <Image source={layers.current.poster} style={imageStyle} resizeMode={resizeMode} />
      </Animated.View>

      <View style={styles.scrims} pointerEvents="none">
        <Svg
          width="100%"
          height={TOP_SCRIM_HEIGHT}
          style={styles.scrimTop}
        >
          <Defs>
            <LinearGradient id={gradientIds.top} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={semantic.scrimTop} />
              <Stop offset="1" stopColor="transparent" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height={TOP_SCRIM_HEIGHT} fill={`url(#${gradientIds.top})`} />
        </Svg>
        <Svg
          width="100%"
          height={BOTTOM_SCRIM_HEIGHT}
          style={styles.scrimBottomOverlay}
        >
          <Defs>
            <LinearGradient id={gradientIds.bottom} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="transparent" />
              <Stop offset="1" stopColor={semantic.scrimBottom} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height={BOTTOM_SCRIM_HEIGHT} fill={`url(#${gradientIds.bottom})`} />
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: semantic.surfaceInset,
  },
  scrims: {
    ...absoluteFill,
  },
  scrimTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
  },
  scrimBottomOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
});
