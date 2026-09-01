import React, { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { apiClient } from '../../../data/apiClient';
import type { SkinProductRemote } from '../../../data/apiClient';
import { AppIcon } from '../../../design-system/AppIcon';
import {
  SKIN_PREVIEW_CARD_HEIGHT,
  SKIN_PREVIEW_CARD_WIDTH,
  SkinPreviewCard,
} from '../../../design-system/SkinPreviewCard';
import { useApp } from '../../../state/AppStore';
import { radii, semantic, space, type } from '../../../theme/tokens';
import { useFocus } from '../../focus/application/FocusStore';
import { formatPrice } from '../../store/domain/storeCatalog';
import { findSkinManifestByIdOrSlug } from '../domain/registry';
import type { SkinManifest } from '../domain/types';
import { useTranslation } from 'react-i18next';

/**
 * S01 陪伴皮肤选择（doc-08 §2）。本屏唯一焦点：被选中的大幅皮肤预览。
 * 三套内置皮肤全部随包分发，真实海报卡片直出；付费卡按 doc-08 §2 显示
 * 右下角价格/Plus 胶囊（价格来自公开目录，拉取失败不显示、不虚构）。
 * 选中已拥有皮肤 → 主按钮「使用这套皮肤」写入选择；选中未拥有皮肤 →
 * 主按钮「去解锁」进入商店详情（S15），不在本屏插入付费弹层。
 */
export function SkinGalleryScreen() {
  const focus = useFocus();
  const { back, navigate } = useApp();
  const { t } = useTranslation('skins');
  const { t: tStore } = useTranslation('store');
  const { width: windowWidth } = useWindowDimensions();
  // 358 基准宽；窄屏由调用方收窄，几何比例不变（doc-07 §3）
  const cardWidth = Math.min(SKIN_PREVIEW_CARD_WIDTH, windowWidth - space.x4 * 2);
  const [selectedId, setSelectedId] = useState(focus.selectedSkinId);

  // 价格目录公开、权益仅登录后拉取；失败降级为无胶囊/按未拥有（不阻塞浏览）
  const [entitlementKeys, setEntitlementKeys] = useState<readonly string[]>([]);
  const [productsBySlug, setProductsBySlug] = useState<
    Readonly<Record<string, SkinProductRemote>>
  >({});
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const { products } = await apiClient.skinProducts();
        if (!mounted) return;
        const bySlug: Record<string, SkinProductRemote> = {};
        for (const product of products) bySlug[product.slug] = product;
        setProductsBySlug(bySlug);
      } catch { /* 离线浏览：无价格胶囊 */ }
      try {
        const { keys } = await apiClient.entitlements();
        if (mounted) setEntitlementKeys(keys);
      } catch { /* 未登录/离线：按未拥有处理 */ }
    })();
    return () => { mounted = false; };
  }, []);

  /** 已拥有判定：免费恒真；付费/Plus 看服务端权益键（目录外按未拥有降级） */
  const isOwned = (manifest: SkinManifest): boolean => {
    if (manifest.accessType === 'free') return true;
    const product = productsBySlug[manifest.slug];
    return product !== undefined && entitlementKeys.includes(product.entitlementKey);
  };

  const selectedManifest = findSkinManifestByIdOrSlug(focus.skins, selectedId);
  const selectedOwned = selectedManifest !== undefined && isOwned(selectedManifest);
  // CTA：选中已拥有 → 应用并返回；选中未拥有 → 去商店详情解锁
  const applySkin = () => {
    if (!selectedManifest || !selectedOwned) return;
    focus.actions.selectSkin(selectedManifest.id);
    back();
  };
  const ctaLabel =
    selectedManifest && !selectedOwned ? t('unlockCta') : t('applySkin');

  const trailingLabelOf = (manifest: SkinManifest): string | undefined => {
    if (isOwned(manifest)) return undefined;
    if (manifest.accessType === 'premium') return t('plusBadge');
    const product = productsBySlug[manifest.slug];
    if (!product) return undefined; // 目录不可达：不显示胶囊，更不虚构价格
    return formatPrice(product.priceMinor, product.currency);
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
        <Text style={styles.headerTitle}>{t('galleryTitle')}</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      >
        {focus.skins.map((manifest) => (
          <SkinPreviewCard
            key={manifest.id}
            manifest={manifest}
            selected={selectedId === manifest.id}
            onPress={() => setSelectedId(manifest.id)}
            trailingLabel={trailingLabelOf(manifest)}
            width={cardWidth}
          />
        ))}
        <Text style={styles.countCaption}>
          {t('freeCount', { n: focus.skins.filter((manifest) => manifest.accessType === 'free').length })}
        </Text>

        {/* 更多皮肤商店入口（P1-A S14）：轻量插入行，不改既有选择流程 */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tStore('storeEntry')}
          onPress={() => navigate('store.home')}
          style={({ pressed }) => [styles.storeEntry, pressed && styles.pressed]}
        >
          <AppIcon name="palette" color={semantic.actionFocus} size={20} />
          <View style={styles.storeEntryTexts}>
            <Text style={styles.storeEntryTitle}>{tStore('storeEntry')}</Text>
            <Text style={styles.storeEntryHint}>{tStore('storeEntryHint')}</Text>
          </View>
          <AppIcon name="chevron-right" color={semantic.textMuted} size={18} />
        </Pressable>
      </ScrollView>

      {/* 底部固定主按钮（安全区 + 12 由外层 SafeArea + paddingBottom 承担） */}
      <View style={styles.ctaArea}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={ctaLabel}
          accessibilityState={{ disabled: !selectedManifest }}
          disabled={!selectedManifest}
          onPress={() => {
            if (selectedManifest && !selectedOwned) {
              navigate('store.skinDetail', { skinSlug: selectedManifest.slug });
              return;
            }
            applySkin();
          }}
          style={({ pressed }) => [
            styles.cta,
            !selectedManifest && styles.ctaDisabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.ctaText}>{ctaLabel}</Text>
        </Pressable>
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
  storeEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x3,
    borderRadius: radii.card,
    backgroundColor: semantic.surface,
    borderWidth: 1,
    borderColor: semantic.borderSoft,
    paddingHorizontal: space.x4,
    minHeight: 64,
  },
  storeEntryTexts: {
    flex: 1,
    gap: 2,
  },
  storeEntryTitle: {
    ...type.bodyStrong,
    color: semantic.textPrimary,
  },
  storeEntryHint: {
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
