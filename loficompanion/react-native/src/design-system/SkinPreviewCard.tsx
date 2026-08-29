import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { stateAsset } from '../features/skins/domain/resolve';
import type { SkinManifest } from '../features/skins/domain/types';
import { radii, semantic, space, type } from '../theme/tokens';
import { AppIcon } from './AppIcon';

type SkinPreviewCardProps = Readonly<{
  manifest: SkinManifest;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  /** 右下角价格/Plus 胶囊文案（doc-08 §2：付费皮肤显示右下角胶囊） */
  trailingLabel?: string;
  /** 覆盖默认 358 宽（小屏由调用方收窄，几何比例不变） */
  width?: number;
}>;

/** doc-08 §2 S01：皮肤卡 358×128、圆角 16；底部 48dp 渐层承载皮肤名。 */
export const SKIN_PREVIEW_CARD_WIDTH = 358;
export const SKIN_PREVIEW_CARD_HEIGHT = 128;
const NAME_SCRIM_HEIGHT = 48;

// RN 0.86 已移除 StyleSheet.absoluteFillObject，统一用显式填充
const absoluteFill = {
  position: 'absolute' as const,
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
};

let gradientSeq = 0;

export function SkinPreviewCard({
  manifest,
  selected = false,
  onPress,
  disabled = false,
  trailingLabel,
  width = SKIN_PREVIEW_CARD_WIDTH,
}: SkinPreviewCardProps) {
  const gradientId = React.useMemo(() => {
    gradientSeq += 1;
    return `skin-name-scrim-${gradientSeq}`;
  }, []);
  const poster = stateAsset(manifest, 'ready').poster;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`选择皮肤 ${manifest.name}`}
      accessibilityState={{ selected, disabled: disabled === true }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.card, { width, borderRadius: radii.card }]}
    >
      <Image source={poster} style={StyleSheet.absoluteFill} resizeMode="cover" />
      {/* 底部 48dp 黑色渐层 + 皮肤名 */}
      <Svg
        width={width}
        height={NAME_SCRIM_HEIGHT}
        style={styles.nameScrim}
        pointerEvents="none"
      >
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="transparent" />
            <Stop offset="1" stopColor={semantic.scrimBottom} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={width} height={NAME_SCRIM_HEIGHT} fill={`url(#${gradientId})`} />
      </Svg>
      <View style={styles.nameRow} pointerEvents="none">
        <Text style={styles.name} numberOfLines={1}>
          {manifest.name}
        </Text>
        {trailingLabel ? (
          <View style={styles.trailing}>
            <Text style={styles.trailingText} numberOfLines={1}>
              {trailingLabel}
            </Text>
          </View>
        ) : null}
      </View>
      {/* 选中：2dp actionFocus 内描边 + 右上角 28dp 圆形勾（距边 10） */}
      {selected ? (
        <View style={[styles.ring, { borderRadius: radii.card }]} pointerEvents="none">
          <View style={styles.checkCircle}>
            <AppIcon name="check" color={semantic.canvasDeep} size={16} />
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    height: SKIN_PREVIEW_CARD_HEIGHT,
    overflow: 'hidden',
  },
  nameScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  nameRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: NAME_SCRIM_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.x3,
    paddingBottom: space.x1,
  },
  name: {
    ...type.bodyStrong,
    color: semantic.textPrimary,
    flexShrink: 1,
  },
  trailing: {
    borderRadius: radii.round,
    backgroundColor: semantic.surfaceRaised,
    paddingHorizontal: space.x2,
    paddingVertical: space.x1,
    marginLeft: space.x2,
  },
  trailingText: {
    ...type.caption,
    color: semantic.textSecondary,
  },
  ring: {
    ...absoluteFill,
    borderWidth: 2,
    borderColor: semantic.actionFocus,
  },
  checkCircle: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: radii.round,
    backgroundColor: semantic.actionFocus,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
