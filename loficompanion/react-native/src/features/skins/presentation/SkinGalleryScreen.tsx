import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { AppIcon } from '../../../design-system/AppIcon';
import {
  SKIN_PREVIEW_CARD_HEIGHT,
  SKIN_PREVIEW_CARD_WIDTH,
  SkinPreviewCard,
} from '../../../design-system/SkinPreviewCard';
import { useApp } from '../../../state/AppStore';
import { radii, semantic, space, type } from '../../../theme/tokens';
import { useFocus } from '../../focus/application/FocusStore';
import { SKIN_STRINGS as STR, UPCOMING_SKINS } from './strings';

/**
 * S01 陪伴皮肤选择（doc-08 §2）。本屏唯一焦点：被选中的大幅皮肤预览。
 * P0-A 仅「雨夜书房」可选；两张占位卡展示「即将推出」，不参与选择。
 */
export function SkinGalleryScreen() {
  const focus = useFocus();
  const { back } = useApp();
  const { width: windowWidth } = useWindowDimensions();
  // 358 基准宽；窄屏由调用方收窄，几何比例不变（doc-07 §3）
  const cardWidth = Math.min(SKIN_PREVIEW_CARD_WIDTH, windowWidth - space.x4 * 2);
  const [selectedId, setSelectedId] = useState(focus.selectedSkinId);
  const canApply = selectedId === focus.skin.id;

  const applySkin = () => {
    if (!canApply) return;
    focus.actions.selectSkin(selectedId);
    back();
  };

  return (
    <View style={styles.screen}>
      {/* App bar 56：左返回 44×44，标题居中 */}
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回"
          onPress={back}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <AppIcon name="arrow-left" color={semantic.textPrimary} size={22} />
        </Pressable>
        <Text style={styles.headerTitle}>{STR.galleryTitle}</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      >
        <SkinPreviewCard
          manifest={focus.skin}
          selected={selectedId === focus.skin.id}
          onPress={() => setSelectedId(focus.skin.id)}
          width={cardWidth}
        />
        {UPCOMING_SKINS.map((skin) => (
          <UpcomingSkinCard key={skin.id} name={skin.name} width={cardWidth} />
        ))}
        <Text style={styles.countCaption}>{STR.freeCount(1)}</Text>
      </ScrollView>

      {/* 底部固定主按钮（安全区 + 12 由外层 SafeArea + paddingBottom 承担） */}
      <View style={styles.ctaArea}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={STR.applySkin}
          accessibilityState={{ disabled: !canApply }}
          disabled={!canApply}
          onPress={applySkin}
          style={({ pressed }) => [
            styles.cta,
            !canApply && styles.ctaDisabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.ctaText}>{STR.applySkin}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** 「即将推出」占位卡：与 SkinPreviewCard 同几何（358×128、圆角 16），不可选 */
function UpcomingSkinCard({ name, width }: Readonly<{ name: string; width: number }>) {
  return (
    <View
      style={[styles.upcomingCard, { width }]}
      accessibilityLabel={`皮肤 ${name}，${STR.comingSoon}`}
      accessibilityRole="text"
    >
      <View style={styles.upcomingNameRow}>
        <Text style={styles.upcomingName} numberOfLines={1}>
          {name}
        </Text>
        <View style={styles.upcomingBadge}>
          <Text style={styles.upcomingBadgeText}>{STR.comingSoon}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semantic.canvas,
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: space.x2,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: radii.round,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...type.title2,
    color: semantic.textPrimary,
    position: 'absolute',
    left: 88,
    right: 88,
    textAlign: 'center',
  },
  list: {
    paddingTop: space.x3,
    paddingHorizontal: space.x4,
    gap: space.x3,
    paddingBottom: space.x5,
  },
  countCaption: {
    ...type.caption,
    color: semantic.textMuted,
    textAlign: 'center',
    marginTop: space.x1,
  },
  upcomingCard: {
    height: SKIN_PREVIEW_CARD_HEIGHT,
    borderRadius: radii.card,
    backgroundColor: semantic.surfaceRaised,
    borderWidth: 1,
    borderColor: semantic.borderSoft,
    justifyContent: 'flex-end',
  },
  upcomingNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.x3,
    paddingBottom: space.x2,
  },
  upcomingName: {
    ...type.bodyStrong,
    color: semantic.textMuted,
    flexShrink: 1,
  },
  upcomingBadge: {
    borderRadius: radii.round,
    borderWidth: 1,
    borderColor: semantic.borderStandard,
    paddingHorizontal: space.x2,
    paddingVertical: space.x1,
    marginLeft: space.x2,
  },
  upcomingBadgeText: {
    ...type.caption,
    color: semantic.textMuted,
  },
  ctaArea: {
    paddingHorizontal: space.x4,
    paddingBottom: space.x3,
  },
  cta: {
    minHeight: 52,
    borderRadius: radii.control,
    backgroundColor: semantic.actionPrimary,
    paddingHorizontal: space.x5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaDisabled: {
    opacity: 0.45,
  },
  ctaText: {
    ...type.bodyStrong,
    color: semantic.canvasDeep,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
});
