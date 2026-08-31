import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { stateAsset } from "../features/skins/domain/resolve";
import type { SkinManifest } from "../features/skins/domain/types";
import { radii, semantic, space, type } from "../theme/tokens";
import { AppIcon } from "./AppIcon";

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

/** doc-08 §2 S01：皮肤卡 358×128、圆角 16。海报 cover 铺满整卡；皮肤名为
 * 半透明胶囊叠在图片上层（2026-08-31 按需求：不整条压暗图片，胶囊只护文字）。 */
export const SKIN_PREVIEW_CARD_WIDTH = 358;
export const SKIN_PREVIEW_CARD_HEIGHT = 128;

// Fabric 下 Image 不吃「仅四边 inset」的 absolute 定位（回退固有尺寸糊图，
// 见 ImmersiveMediaSurface），百分比填充同样不可靠——所有图层统一显式
// 数值宽高定位，并用 zIndex 固定层级：海报(0) < 皮肤名(1) < 选中描边(2)。

export function SkinPreviewCard({
  manifest,
  selected = false,
  onPress,
  disabled = false,
  trailingLabel,
  width = SKIN_PREVIEW_CARD_WIDTH,
}: SkinPreviewCardProps) {
  const poster = stateAsset(manifest, "ready").poster;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`选择皮肤 ${manifest.name}`}
      accessibilityState={{ selected, disabled: disabled === true }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.card, { width, borderRadius: radii.card }]}
    >
      {/* 海报铺满整卡（最底层） */}
      <Image
        source={poster}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width,
          height: SKIN_PREVIEW_CARD_HEIGHT,
          zIndex: 0,
        }}
        resizeMode="cover"
      />
      {/* 皮肤名：半透明胶囊叠在海报上层，不整条压暗图片 */}
      <View style={[styles.nameRow, { zIndex: 1 }]} pointerEvents="none">
        <View style={styles.namePill}>
          <Text style={styles.name} numberOfLines={1}>
            {manifest.name}
          </Text>
        </View>
        {trailingLabel ? (
          <View style={styles.trailing}>
            <Text style={styles.trailingText} numberOfLines={1}>
              {trailingLabel}
            </Text>
          </View>
        ) : null}
      </View>
      {/* 选中：2dp actionFocus 内描边 + 右下角 28dp 圆形勾（距边 10；名字胶囊在左上，勾让位右下） */}
      {selected ? (
        <View
          style={[
            styles.ring,
            {
              width,
              height: SKIN_PREVIEW_CARD_HEIGHT,
              borderRadius: radii.card,
              zIndex: 2,
            },
          ]}
          pointerEvents="none"
        >
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
    overflow: "hidden",
  },
  nameRow: {
    position: "absolute",
    left: 0,
    top: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: space.x2,
    padding: space.x2,
  },
  namePill: {
    borderRadius: radii.round,
    backgroundColor: "rgba(6,16,28,0.55)", // night.950 @55%，压住文字不压图片
    paddingHorizontal: space.x3,
    paddingVertical: space.x1,
  },
  name: {
    ...type.bodyStrong,
    color: semantic.textPrimary,
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
    position: "absolute",
    left: 0,
    top: 0,
    borderWidth: 2,
    borderColor: semantic.actionFocus,
  },
  checkCircle: {
    position: "absolute",
    bottom: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: radii.round,
    backgroundColor: semantic.actionFocus,
    alignItems: "center",
    justifyContent: "center",
  },
});
