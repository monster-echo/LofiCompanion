import React, { useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { apiClient } from '../../../data/apiClient';
import { AppIcon } from '../../../design-system/AppIcon';
import { useApp } from '../../../state/AppStore';
import { usePreferences } from '../../../preferences/PreferencesProvider';
import { skinDisplayName } from '../../skins/domain/registry';
import { radii, space, type, type ThemeColors } from '../../../theme/tokens';
import { useThemeStyles } from '../../../theme/useThemeStyles';
import { useFocus } from '../../focus/application/FocusStore';
import { useAsyncRefresh } from '../../leaderboards/application/useAsyncRefresh';
import { BUILT_IN_SKINS, findSkinManifest } from '../../skins/domain/registry';
import {
  buildStoreSections,
  type StoreSkinCard,
} from '../domain/storeCatalog';
import { useTranslation } from 'react-i18next';
import { storePoster } from './storePosters';
import { i18n } from '../../../i18n/core';

/**
 * S14 陪伴皮肤商店（doc-08 §15，P1-A Task 3）。push 页、未登录可浏览：
 * App bar「陪伴皮肤」+ 右侧「已拥有」过滤；顶部当前皮肤横幅 164「正在使用」；
 * 免费 / 永久购买 / Plus 精选三分区（同一卡片密度）。免费卡点击即使用并
 * 回首页；付费 / Plus 卡进详情页（store.skinDetail），购买只在详情页发生。
 * 价格全部来自服务端目录（docs/05 §8），不显示虚构原价。
 */

const CARD_WIDTH = 176;
const POSTER_HEIGHT = 104;

// 暂时隐藏「永久购买」分区：付费主题尚未设计（2026-08）。主题就绪后改回
// false 即可恢复，目录/详情/下单链路均保留未动。
const PAID_SECTION_HIDDEN = true;

// RN 0.86 已移除 StyleSheet.absoluteFillObject，统一用显式填充。
// Fabric 下 Image 不吃「仅四边 inset」的 absolute 定位，须显式给宽高（见 ImmersiveMediaSurface）
const absoluteFill = {
  position: 'absolute' as const,
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
} as const;
const imageFill = {
  position: 'absolute' as const,
  left: 0,
  top: 0,
  width: '100%' as const,
  height: '100%' as const,
} as const;

export function SkinStoreScreen() {
  const { back, navigate, user } = useApp();
  const { locale, palette } = usePreferences();
  const styles = useThemeStyles(makeStyles);
  const { t } = useTranslation('store');
  const focus = useFocus();
  const signedIn = user !== null;
  const { width: windowWidth } = useWindowDimensions();
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [ownedKeys, setOwnedKeys] = useState<readonly string[]>([]);

  const { state, reload } = useAsyncRefresh(async () => {
    // 目录公开；权益仅登录后拉取（失败不阻塞目录——按未拥有降级重拉一次）
    let keys: readonly string[] = [];
    try {
      if (signedIn) keys = (await apiClient.entitlements()).keys;
    } catch { /* 已拥有标记降级为未拥有，目录仍可浏览 */ }
    setOwnedKeys(keys);
    const { products } = await apiClient.skinProducts();
    return { products } as const;
  }, [signedIn]);

  const sections = useMemo(() => {
    if (state.status !== 'ready') return null;
    return buildStoreSections({
      products: state.data.products,
      // 三套内置皮肤全免费、随包分发，列免费区头部（doc-01 PRD）
      localSkins: BUILT_IN_SKINS.map((skin) => ({
        id: skin.id,
        slug: skin.slug,
        name: skin.name,
        stateCount: skin.states.length,
      })),
      ownedKeys,
      selectedSkinSlug: focus.skin.slug,
    });
  }, [focus.skin, ownedKeys, state]);

  const visibleSections = useMemo(() => {
    if (!sections) return null;
    if (!ownedOnly) return sections;
    return {
      free: sections.free.filter((card) => card.owned),
      paid: sections.paid.filter((card) => card.owned),
      premium: sections.premium.filter((card) => card.owned),
    } as const;
  }, [ownedOnly, sections]);

  const onPressCard = (card: StoreSkinCard) => {
    if (card.accessType === 'free') {
      // 本地内置皮肤：直接应用并回首页（已在用则仅返回）；远端免费皮肤进详情（清单未随包）
      const local = findSkinManifest(card.slug);
      if (local) {
        if (local.id !== focus.skin.id) focus.actions.selectSkin(local.id);
        back();
        return;
      }
    }
    navigate('store.skinDetail', { skinSlug: card.slug });
  };

  return (
    <View style={styles.screen}>
      {/* App bar 56：返回 44×44 + 居中标题 + 右「已拥有」过滤（doc-08 §15） */}
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={i18n.t('common:back')}
          onPress={back}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <AppIcon name="arrow-left" color={palette.textPrimary} size={22} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('appBarTitle')}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={ownedOnly ? t('browsingAll') : t('ownedEntry')}
          accessibilityState={{ selected: ownedOnly }}
          onPress={() => setOwnedOnly((value) => !value)}
          style={({ pressed }) => [styles.ownedEntry, pressed && styles.pressed]}
        >
          <Text style={[styles.ownedEntryText, ownedOnly && styles.ownedEntryActive]}>
            {ownedOnly ? t('browsingAll') : t('ownedEntry')}
          </Text>
        </Pressable>
      </View>

      {state.status === 'error' ? (
        <View style={styles.stateArea}>
          <AppIcon name="alert" color={palette.warning} size={28} />
          <Text style={styles.stateText}>{t('loadFailed')}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('retry')}
            onPress={reload}
            style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
          >
            <Text style={styles.retryText}>{t('retry')}</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        >
          <CurrentSkinBanner
            slug={focus.skin.slug}
            name={skinDisplayName(focus.skin, locale)}
            width={Math.min(windowWidth - space.x4 * 2, 358)}
          />

          {state.status === 'loading' || !visibleSections ? (
            <SectionsSkeleton windowWidth={windowWidth} />
          ) : (
            <>
              <Section
                title={t('sectionFree')}
                cards={visibleSections.free}
                windowWidth={windowWidth}
                onPressCard={onPressCard}
              />
              {!PAID_SECTION_HIDDEN && (
                <Section
                  title={t('sectionPaid')}
                  cards={visibleSections.paid}
                  windowWidth={windowWidth}
                  onPressCard={onPressCard}
                />
              )}
              <Section
                title={t('sectionPremium')}
                cards={visibleSections.premium}
                windowWidth={windowWidth}
                onPressCard={onPressCard}
              />
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

/** 顶部当前皮肤横幅 164：海报 + 底部渐层 + 「正在使用」（doc-08 §15） */
function CurrentSkinBanner({
  slug,
  name,
  width,
}: Readonly<{ slug: string; name: string; width: number }>) {
  const { t } = useTranslation('store');
  const styles = useThemeStyles(makeStyles);
  const poster = storePoster(slug, 'ready');
  return (
    <View
      style={[styles.banner, { width }]}
      accessibilityLabel={`当前皮肤 ${name}，${t('inUse')}`}
      accessibilityRole="text"
    >
      {poster ? (
        <Image source={poster} style={imageFill} resizeMode="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.bannerPlaceholder]} />
      )}
      <View style={styles.bannerScrim} pointerEvents="none" />
      <View style={styles.bannerRow} pointerEvents="none">
        <Text style={styles.bannerName} numberOfLines={1}>{name}</Text>
        <View style={styles.inUseBadge}>
          <Text style={styles.inUseBadgeText}>{t('inUse')}</Text>
        </View>
      </View>
    </View>
  );
}

function Section({
  title,
  cards,
  windowWidth,
  onPressCard,
}: Readonly<{
  title: string;
  cards: readonly StoreSkinCard[];
  windowWidth: number;
  onPressCard: (card: StoreSkinCard) => void;
}>) {
  const { t } = useTranslation('store');
  const styles = useThemeStyles(makeStyles);
  if (cards.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {/* 每区同一横向卡密度（doc-08 §15：不混合三种密度） */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.sectionRow}
      >
        {cards.map((card) => (
          <StoreCard
            key={card.slug}
            card={card}
            width={Math.min(CARD_WIDTH, (windowWidth - space.x4 * 2 - space.x3) / 2)}
            onPress={() => onPressCard(card)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function StoreCard({
  card,
  width,
  onPress,
}: Readonly<{ card: StoreSkinCard; width: number; onPress: () => void }>) {
  const { t } = useTranslation('store');
  const { palette } = usePreferences();
  const styles = useThemeStyles(makeStyles);
  const poster = storePoster(card.slug, 'ready');
  const priceText = card.accessType === 'free'
    ? t('priceFree')
    : card.priceLabel ?? t('plusLabel');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('skinCardA11y', {
        name: card.name,
        count: card.stateCount,
        tail: card.owned ? t('ownedBadge') : priceText,
      })}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { width },
        card.inUse && styles.cardInUse,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.posterArea}>
        {poster ? (
          <Image source={poster} style={imageFill} resizeMode="cover" />
        ) : (
          <View style={styles.posterPlaceholder}>
            <AppIcon name="image" color={palette.textMuted} size={22} />
          </View>
        )}
        {/* 使用中 / 已拥有 徽标（doc-08 §15 状态） */}
        {card.inUse ? (
          <View style={[styles.cornerBadge, styles.inUseCorner]}>
            <Text style={styles.inUseBadgeText}>{t('inUseBadge')}</Text>
          </View>
        ) : card.owned ? (
          <View style={[styles.cornerBadge, styles.ownedCorner]}>
            <AppIcon name="check" color={palette.canvasDeep} size={12} />
            <Text style={styles.ownedCornerText}>{t('ownedBadge')}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.cardName} numberOfLines={1}>{card.name}</Text>
        <Text style={styles.cardStates}>{t('stateCount', { n: card.stateCount })}</Text>
        <View
          style={[
            styles.pricePill,
            card.accessType === 'premium' && styles.pricePillPlus,
          ]}
        >
          <Text
            style={[
              styles.pricePillText,
              card.accessType === 'premium' && styles.pricePillPlusText,
            ]}
            numberOfLines={1}
          >
            {priceText}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

/** 价格加载中骨架（doc-08 §15：失败前占位，不可点） */
function SectionsSkeleton({ windowWidth }: Readonly<{ windowWidth: number }>) {
  const styles = useThemeStyles(makeStyles);
  const cardWidth = Math.min(CARD_WIDTH, (windowWidth - space.x4 * 2 - space.x3) / 2);
  return (
    <>
      {/* 骨架分区与实际分区保持一致（永久购买隐藏期间不出现） */}
      {(['免费', ...(PAID_SECTION_HIDDEN ? [] : ['永久购买']), 'Plus 精选'] as const).map((title) => (
        <View key={title} style={styles.section}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <View style={styles.skeletonRow}>
            <View style={[styles.skeletonCard, { width: cardWidth }]} />
            <View style={[styles.skeletonCard, { width: cardWidth }]} />
          </View>
        </View>
      ))}
    </>
  );
}

const makeStyles = (p: ThemeColors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: p.canvas,
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
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
    color: p.textPrimary,
    position: 'absolute',
    left: 88,
    right: 88,
    textAlign: 'center',
  },
  ownedEntry: {
    marginLeft: 'auto',
    minHeight: 44,
    paddingHorizontal: space.x2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownedEntryText: {
    ...type.bodyStrong,
    color: p.actionFocus,
  },
  ownedEntryActive: {
    color: p.textSecondary,
  },
  list: {
    paddingTop: space.x3,
    paddingHorizontal: space.x4,
    gap: space.x5,
    paddingBottom: space.x6,
  },
  banner: {
    height: 164,
    borderRadius: radii.card,
    overflow: 'hidden',
    alignSelf: 'center',
  },
  bannerPlaceholder: {
    backgroundColor: p.surfaceRaised,
  },
  bannerScrim: {
    ...absoluteFill,
    backgroundColor: 'rgba(6,16,28,0.34)',
  },
  bannerRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.x4,
    paddingBottom: space.x3,
  },
  bannerName: {
    ...type.title3,
    // banner 标题压在固定暗色 scrim 之上（bannerScrim）：onMedia 固定浅色
    // （原 textPrimary 亮色下变深字 → 暗底深字不可读，3.3 修复）
    color: p.onMedia,
    flexShrink: 1,
  },
  inUseBadge: {
    borderRadius: radii.round,
    backgroundColor: p.actionPrimary,
    paddingHorizontal: space.x3,
    paddingVertical: space.x1,
    marginLeft: space.x2,
  },
  inUseBadgeText: {
    ...type.micro,
    color: p.canvasDeep,
  },
  section: {
    gap: space.x3,
  },
  sectionTitle: {
    ...type.title3,
    color: p.textPrimary,
  },
  sectionRow: {
    gap: space.x3,
  },
  card: {
    borderRadius: radii.card,
    backgroundColor: p.surface,
    borderWidth: 1,
    borderColor: p.borderSoft,
    overflow: 'hidden',
  },
  cardInUse: {
    borderColor: p.borderEmphasis,
  },
  posterArea: {
    height: POSTER_HEIGHT,
    backgroundColor: p.surfaceRaised,
  },
  posterPlaceholder: {
    ...absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cornerBadge: {
    position: 'absolute',
    top: space.x2,
    right: space.x2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radii.round,
    paddingHorizontal: space.x2,
    paddingVertical: 3,
  },
  inUseCorner: {
    backgroundColor: p.actionPrimary,
  },
  ownedCorner: {
    backgroundColor: p.actionFocus,
  },
  ownedCornerText: {
    ...type.micro,
    color: p.canvasDeep,
  },
  cardInfo: {
    padding: space.x3,
    gap: 2,
  },
  cardName: {
    ...type.bodyStrong,
    color: p.textPrimary,
  },
  cardStates: {
    ...type.caption,
    color: p.textMuted,
  },
  pricePill: {
    alignSelf: 'flex-start',
    marginTop: space.x1,
    borderRadius: radii.round,
    borderWidth: 1,
    borderColor: p.borderStandard,
    backgroundColor: p.surfaceRaised,
    paddingHorizontal: space.x2,
    paddingVertical: 3,
  },
  pricePillPlus: {
    borderColor: p.borderEmphasis,
    backgroundColor: 'rgba(79,143,232,0.16)',
  },
  pricePillText: {
    ...type.micro,
    color: p.textSecondary,
  },
  pricePillPlusText: {
    color: p.actionFocus,
  },
  skeletonRow: {
    flexDirection: 'row',
    gap: space.x3,
  },
  skeletonCard: {
    height: POSTER_HEIGHT + 92,
    borderRadius: radii.card,
    backgroundColor: p.surfaceRaised,
    opacity: 0.55,
  },
  stateArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.x3,
    paddingHorizontal: space.x6,
  },
  stateText: {
    ...type.body,
    color: p.textSecondary,
    textAlign: 'center',
  },
  retryButton: {
    minHeight: 44,
    paddingHorizontal: space.x5,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: p.borderStandard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    ...type.bodyStrong,
    color: p.textPrimary,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
});
