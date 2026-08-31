import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  LayoutChangeEvent,
  StyleSheet,
  View,
  StyleProp,
  ViewStyle,
} from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { stateAsset } from "../domain/resolve";
import type {
  CompanionState,
  SkinManifest,
  SkinStateAsset,
} from "../domain/types";
import { primitives, semantic } from "../../../theme/tokens";

export type ImmersiveMediaSurfaceProps = Readonly<{
  manifest: SkinManifest;
  state: CompanionState;
  /** doc-07 §9.2：容器 cover，不拉伸 */
  resizeMode?: "cover" | "contain";
  /** 减少动态：状态切换不做叠化，直接换海报（doc-07 §10） */
  reducedMotion?: boolean;
  /** 容器尺寸由调用方决定（absoluteFill / 56% 高等），缺省跟随父级布局 */
  style?: StyleProp<ViewStyle>;
}>;

// doc-07 §9.3 叠层：顶部约 136dp（scrimTop→透明），底部约 260dp（透明→scrimBottom）
const TOP_SCRIM_HEIGHT = 136;
const BOTTOM_SCRIM_HEIGHT = 260;
// 双缓冲叠化时长；全屏静态海报构图差异大，太短读作硬切
const DEFAULT_CROSSFADE_MS = 500;
// onLoadEnd 迟迟不触发的兜底：超时也启动叠化，避免旧海报无限悬挂
const DECODE_FALLBACK_MS = 400;
// 动画参数缺省值；skin.yaml `animation` 段可逐主题覆盖（focalZoom=1 不裁切）
const DEFAULT_FOCAL_ZOOM = 1;

let gradientSeq = 0;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// RN 0.86 已移除 StyleSheet.absoluteFillObject，统一用显式填充。
// 注意：Fabric 下 RCTImageComponentView 对「仅用四边 inset 的 absolute 定位」
// 不生效（会回退到图片像素固有尺寸、放大裁切糊图），Image 必须显式给宽高。
const absoluteFill = {
  position: "absolute" as const,
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
};
const imageFill = {
  position: "absolute" as const,
  left: 0,
  top: 0,
  width: "100%" as const,
  height: "100%" as const,
};

/** 双缓冲槽位：x 常驻，y 首次转场时挂载；两槽交替充当显隐层 */
type SlotKey = "x" | "y";

interface BufferState {
  slots: { x: SkinStateAsset; y: SkinStateAsset | null };
  /** 当前全亮显示的槽 */
  visible: SlotKey;
  /** 各槽当前资产是否已解码（隐藏层退役后常驻，切回时零解码等待） */
  decoded: { x: boolean; y: boolean };
  /** 待切入资产（等解码后叠化）；null = 空闲 */
  incoming: SkinStateAsset | null;
}

/**
 * doc-07 §9 沉浸媒体面：全屏/大面积状态海报，cover 取景、围绕 manifest
 * 焦点构图；顶部/底部渐暗叠层。状态切换为双缓冲叠化：前后海报常驻两层、
 * 待切入海报解码完成后双向 opacity 交叉过渡——两层同长同起点，不透明度
 * 之和恒为 1，叠化全程始终有海报全像素覆盖（任何解码抖动都不会露底色）。
 * 纯渲染组件——不持有播放状态，仅随 props 变化做视觉过渡。
 */
export function ImmersiveMediaSurface({
  manifest,
  state,
  resizeMode = "cover",
  reducedMotion = false,
  style,
}: ImmersiveMediaSurfaceProps) {
  const gradientIds = useMemo(() => {
    gradientSeq += 1;
    const seq = gradientSeq;
    return {
      top: `media-scrim-top-${seq}`,
      bottom: `media-scrim-bottom-${seq}`,
    };
  }, []);

  const [layout, setLayout] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [buf, setBuf] = useState<BufferState>(() => ({
    slots: { x: stateAsset(manifest, state), y: null },
    visible: "x",
    decoded: { x: true, y: true },
    incoming: null,
  }));
  const xFade = useRef(new Animated.Value(1)).current;
  const yFade = useRef(new Animated.Value(0)).current;
  const dissolve = useRef<Animated.CompositeAnimation | null>(null);
  const decodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- 状态 → 缓冲：只改槽位/解码标记/挂起，透明度全部交给叠化编排 ----
  useEffect(() => {
    const next = stateAsset(manifest, state);
    setBuf((prev) => {
      const visAsset = prev.visible === "x" ? prev.slots.x : prev.slots.y;
      if (!visAsset || visAsset.poster === next.poster) {
        // 同海报（含 playing 回归基态的冗余切换）：仅清挂起
        return prev.incoming === null ? prev : { ...prev, incoming: null };
      }
      if (reducedMotion) {
        // 减少动态：直接写可见槽（doc-07 §10）
        return prev.visible === "x"
          ? {
              slots: { x: next, y: prev.slots.y },
              visible: "x",
              decoded: { x: true, y: prev.decoded.y },
              incoming: null,
            }
          : {
              slots: { x: prev.slots.x, y: next },
              visible: "y",
              decoded: { x: prev.decoded.x, y: true },
              incoming: null,
            };
      }
      const target: SlotKey = prev.visible === "x" ? "y" : "x";
      // 隐藏层已是目标海报（暂停↔恢复往返）→ 已解码，零等待
      const warm = prev.slots[target]?.poster === next.poster;
      return {
        slots: { ...prev.slots, [target]: next },
        visible: prev.visible,
        decoded: { ...prev.decoded, [target]: warm },
        incoming: next,
      };
    });
  }, [manifest, state, reducedMotion]);

  // ---- 叠化编排：空闲复位 / 等解码 / 双向交叉过渡 ----
  useEffect(() => {
    const visKey = buf.visible;
    const targetKey: SlotKey = visKey === "x" ? "y" : "x";
    const fadeVis = visKey === "x" ? xFade : yFade;
    const fadeTarget = targetKey === "x" ? xFade : yFade;

    if (buf.incoming === null) {
      // 空闲：停在途动画并复位（覆盖 mid-flight 打断、同海报回归、减少动态直切）
      dissolve.current?.stop();
      dissolve.current = null;
      if (decodeTimer.current) {
        clearTimeout(decodeTimer.current);
        decodeTimer.current = null;
      }
      fadeVis.setValue(1);
      fadeTarget.setValue(0);
      return;
    }

    // 目标海报未就绪：旧海报保持全亮，等 onLoadEnd（兜底超时后放行）
    if (!buf.decoded[targetKey]) {
      dissolve.current?.stop();
      dissolve.current = null;
      fadeVis.setValue(1);
      fadeTarget.setValue(0);
      const expected = buf.incoming.poster;
      if (decodeTimer.current) clearTimeout(decodeTimer.current);
      decodeTimer.current = setTimeout(() => {
        decodeTimer.current = null;
        setBuf((prev) =>
          prev.incoming?.poster === expected &&
          prev.slots[targetKey]?.poster === expected
            ? { ...prev, decoded: { ...prev.decoded, [targetKey]: true } }
            : prev,
        );
      }, DECODE_FALLBACK_MS);
      return;
    }

    // 双向叠化：旧 1→0、新 0→1；同长同起点，和恒为 1，不露底色
    if (decodeTimer.current) {
      clearTimeout(decodeTimer.current);
      decodeTimer.current = null;
    }
    dissolve.current?.stop();
    fadeVis.setValue(1);
    fadeTarget.setValue(0);
    const duration = manifest.animation?.crossfadeMs ?? DEFAULT_CROSSFADE_MS;
    const anim = Animated.parallel([
      Animated.timing(fadeVis, {
        toValue: 0,
        duration,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(fadeTarget, {
        toValue: 1,
        duration,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    ]);
    dissolve.current = anim;
    anim.start(({ finished }) => {
      if (!finished) return;
      dissolve.current = null;
      setBuf((prev) => ({ ...prev, visible: targetKey, incoming: null }));
    });
  }, [buf, manifest, xFade, yFade]);

  // 各槽海报解码完成（成功或失败都放行）——隐藏层常驻退役海报，往返切换零等待
  const markDecoded = (key: SlotKey) => {
    setBuf((prev) =>
      prev.decoded[key]
        ? prev
        : { ...prev, decoded: { ...prev.decoded, [key]: true } },
    );
  };

  useEffect(() => {
    return () => {
      if (decodeTimer.current) clearTimeout(decodeTimer.current);
      dissolve.current?.stop();
    };
  }, []);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setLayout((prev) =>
      prev &&
      Math.abs(prev.width - width) < 1 &&
      Math.abs(prev.height - height) < 1
        ? prev
        : { width, height },
    );
  };

  // 焦点取景：按 manifest.animation.focalZoom 放大（1=不放大不裁切），
  // 把焦点平移到容器中心并夹紧边缘。转场中前后图层各自取景，
  // 避免焦点不同的两张海报在叠化起点发生构图跳变。
  const styleFor = (asset: SkinStateAsset) => {
    const focalZoom = manifest.animation?.focalZoom ?? DEFAULT_FOCAL_ZOOM;
    if (!layout || focalZoom === 1) return imageFill;
    const width = layout.width * focalZoom;
    const height = layout.height * focalZoom;
    const left = clamp(
      layout.width / 2 - asset.focalPointX * width,
      layout.width - width,
      0,
    );
    const top = clamp(
      layout.height / 2 - asset.focalPointY * height,
      layout.height - height,
      0,
    );
    return {
      position: "absolute" as const,
      width,
      height,
      left,
      top,
    };
  };

  return (
    <View
      style={[styles.container, style]}
      onLayout={onLayout}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={[absoluteFill, { opacity: xFade }]}>
        <Image
          source={buf.slots.x.poster}
          style={styleFor(buf.slots.x)}
          resizeMode={resizeMode}
          onLoadEnd={() => markDecoded("x")}
        />
      </Animated.View>
      {buf.slots.y ? (
        <Animated.View style={[absoluteFill, { opacity: yFade }]}>
          <Image
            source={buf.slots.y.poster}
            style={styleFor(buf.slots.y)}
            resizeMode={resizeMode}
            onLoadEnd={() => markDecoded("y")}
          />
        </Animated.View>
      ) : null}

      <View style={styles.scrims} pointerEvents="none">
        <Svg width="100%" height={TOP_SCRIM_HEIGHT} style={styles.scrimTop}>
          <Defs>
            <LinearGradient
              id={gradientIds.top}
              x1="0%"
              y1="0%"
              x2="0%"
              y2="100%"
            >
              <Stop
                offset="0%"
                stopColor={primitives.night[950]}
                stopOpacity={0.62}
              />
              <Stop
                offset="100%"
                stopColor={primitives.night[950]}
                stopOpacity={0}
              />
            </LinearGradient>
          </Defs>
          <Rect
            x="0"
            y="0"
            width="100%"
            height={TOP_SCRIM_HEIGHT}
            fill={`url(#${gradientIds.top})`}
          />
        </Svg>
        <Svg
          width="100%"
          height={BOTTOM_SCRIM_HEIGHT}
          style={styles.scrimBottomOverlay}
        >
          <Defs>
            <LinearGradient
              id={gradientIds.bottom}
              x1="0%"
              y1="0%"
              x2="0%"
              y2="100%"
            >
              <Stop
                offset="0%"
                stopColor={primitives.night[950]}
                stopOpacity={0}
              />
              <Stop
                offset="100%"
                stopColor={primitives.night[950]}
                stopOpacity={0.88}
              />
            </LinearGradient>
          </Defs>
          <Rect
            x="0"
            y="0"
            width="100%"
            height={BOTTOM_SCRIM_HEIGHT}
            fill={`url(#${gradientIds.bottom})`}
          />
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
    backgroundColor: semantic.surfaceInset,
  },
  scrims: {
    ...absoluteFill,
  },
  scrimTop: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
  },
  scrimBottomOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
});
