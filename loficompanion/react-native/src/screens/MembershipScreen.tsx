import React, { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { currentLanguage } from '../i18n/core';
import { AppButton, PageHeader } from '../design-system/components';
import { AppIcon, type IconName } from '../design-system/AppIcon';
import { storeSkuOf, useStorePrices } from '../payment/useStorePrices';
import { useApp } from '../state/AppStore';
import { useFocus } from '../features/focus/application/FocusStore';
import { storeCardPoster, storePoster } from '../features/store/presentation/storePosters';
import { apiClient, skinPosterUrl } from '../data/apiClient';
import { telemetry } from '../telemetry/Telemetry';
import type { BillingPlan, MembershipTier } from '../domain/models';
import type { Subscription } from '../payment/paymentModels';
import { planDisplayName, tierDisplaySummary } from '../domain/membershipCopy';
import { primitives, radii, space, type, type ThemeColors } from '../theme/tokens';
import { useThemeStyles } from '../theme/useThemeStyles';
import { usePreferences } from '../preferences/PreferencesProvider';
import { RestoreLink } from './MembershipRestoreRow';

/**
 * 会员中心（2026-09 场景化改版）：卖权益，不卖配置。
 * 购买态 = 场景 hero（当前皮肤海报压暗纱）+ 权益清单（entitlement 键翻译成
 * 人话，docs/05 §4）+ 双价格卡（推荐角标/省钱标签）+ 粘性底栏 CTA + 小字链接；
 * 已订阅态 = 渐变会员卡（生效中徽标 + 权益 checklist + 管理/换肤双按钮）
 * + 精选皮肤横滑行。设计稿：/tmp/lofi-membership-mockup/lofi-membership-mockup.png。
 * 价格以商店本地化价为准（useStorePrices），商店不可达回落服务端定价；
 * 「支付渠道」等内部细节不再暴露，mock 提示仅紧贴 CTA 出现。
 */

// RN 0.86 已移除 StyleSheet.absoluteFillObject；Fabric 下 Image 不吃「仅四边
// inset」的 absolute 定位，须显式给宽高（见 ImmersiveMediaSurface / SkinStoreScreen）
const imageFill = {
  position: 'absolute',
  left: 0,
  top: 0,
  width: '100%',
  height: '100%',
} as const;

const HERO_SCRIM_ID = 'membership-hero-scrim';
const MEMBER_FILL_ID = 'membership-card-fill';
// 暗纱基色：压在海报上属媒体层，主题无关（onMedia 同语义，见 doc-07 §4.2）
const HERO_SCRIM = primitives.night[950];

export function MembershipScreen() {
  const { t } = useTranslation('membership');
  const { config, user, navigate, busy, setPendingPlanId, setPurchaseState } = useApp();
  const insets = useSafeAreaInsets();
  const localStyles = useThemeStyles(makeStyles);
  // 商店本地化价格（审核要求价格来自商店）；商店不可达回落服务端定价
  const storePrices = useStorePrices(config.plans);

  // 订阅判定与 ProfileScreens 同语义：tierId 命中目录等级即会员；并集
  // plans.tierId 兜「等级目录漂移但方案仍在」的服务端配置。
  const knownTierIds = useMemo(
    () => new Set([
      ...config.tiers.map((tier) => tier.id),
      ...config.plans.map((plan) => plan.tierId),
    ]),
    [config],
  );
  const isMember = user !== null && user.tierId !== '' && knownTierIds.has(user.tierId);
  const memberTier = user ? config.tiers.find((tier) => tier.id === user.tierId) ?? null : null;
  const displayTier = memberTier
    ?? config.tiers.find((tier) => tier.recommended)
    ?? config.tiers[0]
    ?? null;

  // 订阅状态可见化（RC 状态机消费端转译）：membership/current 的 subscription
  // 行是唯一来源——下次续费日期 / expired 徽章。best-effort：拉取失败不挡会员页。
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  useEffect(() => {
    if (!user) { setSubscription(null); return; }
    let mounted = true;
    void apiClient.membershipCurrent()
      .then((current) => { if (mounted) setSubscription(current.subscription); })
      .catch(() => undefined);
    return () => { mounted = false; };
  }, [user]);
  const subscriptionExpired = subscription?.status === 'expired';
  const renewDate = subscription?.status === 'active' && subscription.renewAt
    ? new Date(subscription.renewAt).toLocaleDateString(currentLanguage())
    : null;

  // 默认选中推荐等级的首个方案（设计稿：年付高亮）；用户点选后以点选为准
  const defaultPlanId = useMemo(() => {
    const rec = config.tiers.find((tier) => tier.recommended);
    const plan = rec ? config.plans.find((item) => item.tierId === rec.id) : undefined;
    return plan?.id ?? config.plans[0]?.id ?? '';
  }, [config]);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const selectedId = pickedId ?? defaultPlanId;
  const selectedPlan = config.plans.find((plan) => plan.id === selectedId);

  // 「推荐」角标只挂推荐等级的首个方案（同等级多方案时不逐个贴标）
  const recommendedPlanId = useMemo(() => {
    const rec = config.tiers.find((tier) => tier.recommended);
    if (!rec) return null;
    return config.plans.find((item) => item.tierId === rec.id)?.id ?? null;
  }, [config]);

  const buy = () => {
    if (!user) { navigate('auth.signIn'); return; }
    if (!selectedId) return;
    setPurchaseState({ kind: 'idle' });
    setPendingPlanId(selectedId);
    navigate('membership.checkout');
  };

  // 订阅合规（App Store 3.1.2 / Play 支付政策）：跳转商店订阅管理页，
  // 用户可随时在系统侧取消/续订
  const openManageSubscriptions = () => {
    void Linking.openURL(
      Platform.OS === 'android'
        ? 'https://play.google.com/store/account/subscriptions'
        : 'https://apps.apple.com/account/subscriptions',
    );
  };

  const hasPlans = config.plans.length > 0;

  return (
    <View style={localStyles.screen}>
      <PageHeader title={t('title')} />
      <ScrollView contentContainerStyle={localStyles.list} showsVerticalScrollIndicator={false}>
        {isMember ? (
          <>
            <MemberCard
              tierName={memberTier?.name ?? t('memberFallbackTitle')}
              subtitle={renewDate
                ? t('renewsOn', { date: renewDate })
                : subscriptionExpired
                  ? t('subscriptionExpiredHint')
                  : t('memberCardSubtitle')}
              expired={subscriptionExpired}
              entitlements={displayTier?.entitlements ?? []}
              summary={displayTier ? tierDisplaySummary(displayTier, t) : ''}
            />
            <View style={localStyles.memberActions}>
              {subscriptionExpired ? (
                <View style={localStyles.memberAction}>
                  <AppButton label={t('memberRenew')} icon="crown" onPress={() => navigate('membership.plans')} />
                </View>
              ) : null}
              <View style={localStyles.memberAction}>
                <AppButton variant="secondary" label={t('memberManage')} icon="settings" onPress={openManageSubscriptions} />
              </View>
              <View style={localStyles.memberAction}>
                <AppButton label={t('memberChangeSkin')} icon="palette" onPress={() => navigate('store.home')} />
              </View>
            </View>
            <SkinsRow />
          </>
        ) : (
          <>
            <SceneHero />
            <Text style={localStyles.sectionLabel}>{t('sectionBenefits')}</Text>
            <BenefitsSection
              tiers={config.tiers}
              singleTier={config.tiers.length <= 1}
            />
            {hasPlans ? (
              <>
                <Text style={localStyles.sectionLabel}>{t('sectionPlans')}</Text>
                <View style={localStyles.planRow}>
                  {config.plans.map((plan) => (
                    <PlanCard
                      key={plan.id}
                      plan={plan}
                      price={planPrice(plan, storePrices, t)}
                      selected={plan.id === selectedId}
                      recommended={plan.id === recommendedPlanId}
                      onSelect={() => {
                        telemetry.track('ui_action', { action_id: `membership.selectPlan.${plan.id}` });
                        setPickedId(plan.id);
                      }}
                    />
                  ))}
                </View>
              </>
            ) : (
              <Text style={localStyles.emptyText}>{t('emptyPlans')}</Text>
            )}
          </>
        )}
      </ScrollView>
      {/* 粘性底栏：CTA 常驻（转化页范式），小字链接弱化视觉层级 */}
      <View style={[localStyles.footer, { paddingBottom: insets.bottom + space.x4 }]}>
        {!isMember && hasPlans && selectedPlan ? (
          <>
            {selectedPlan.provider === 'mock' ? (
              <Text style={localStyles.mockNotice}>{t('mockNotice')}</Text>
            ) : null}
            <AppButton
              disabled={busy}
              label={busy
                ? t('confirming')
                : !user
                  ? t('signInToSubscribe')
                  : selectedPlan.provider === 'mock'
                    ? t('mockOrder')
                    : `${t('confirmSubscribe')} · ${planPrice(selectedPlan, storePrices, t)}`}
              icon="crown"
              onPress={buy}
            />
          </>
        ) : null}
        <View style={localStyles.linksRow}>
          <RestoreLink />
          <Text style={localStyles.linkDot}>·</Text>
          <FooterLink
            label={t('linkManageSubs')}
            onPress={() => {
              telemetry.track('ui_action', { action_id: 'membership.manageSubscriptions' });
              openManageSubscriptions();
            }}
          />
          <Text style={localStyles.linkDot}>·</Text>
          <FooterLink label={t('linkLegal')} onPress={() => navigate('settings.legal')} />
          <Text style={localStyles.linkDot}>·</Text>
          <FooterLink
            label={t('linkStore')}
            onPress={() => {
              telemetry.track('ui_action', { action_id: 'membership.browseStore' });
              navigate('store.home');
            }}
          />
          <Text style={localStyles.linkDot}>·</Text>
          <FooterLink label={t('linkOrders')} onPress={() => navigate('membership.orders')} />
        </View>
      </View>
    </View>
  );
}

/** 计费价格：商店本地化价优先（含「/月」尾缀由商店文案决定），回落服务端定价 */
function planPrice(
  plan: BillingPlan,
  storePrices: Readonly<Record<string, string>>,
  t: TFunction<'membership'>,
): string {
  const sku = storeSkuOf(plan);
  return (sku !== null ? storePrices[sku] : undefined) ?? formatPrice(plan, t);
}

/** 场景 hero：当前皮肤海报满铺 + 底部渐显暗纱 + 主文案（会员=每晚那个画面） */
function SceneHero() {
  const { t } = useTranslation('membership');
  const focus = useFocus();
  const localStyles = useThemeStyles(makeStyles);
  // 复用商店海报管线：本地清单优先，未拉取的云端皮肤走 biz 公开海报
  const poster = storePoster(focus.skins, focus.skin.slug, 'ready')
    ?? { uri: skinPosterUrl(focus.skin.slug) };
  return (
    <View style={localStyles.hero}>
      <Image source={poster} style={imageFill} resizeMode="cover" />
      <View style={localStyles.heroScrim} pointerEvents="none">
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id={HERO_SCRIM_ID} x1="0%" y1="0%" x2="0%" y2="100%">
              <Stop offset="0%" stopColor={HERO_SCRIM} stopOpacity={0.10} />
              <Stop offset="55%" stopColor={HERO_SCRIM} stopOpacity={0.42} />
              <Stop offset="100%" stopColor={HERO_SCRIM} stopOpacity={0.88} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${HERO_SCRIM_ID})`} />
        </Svg>
      </View>
      <View style={localStyles.heroCopy} pointerEvents="none">
        <Text style={localStyles.heroTitle}>{t('heroTitle')}</Text>
        <Text style={localStyles.heroSubtitle}>{t('heroSubtitle')}</Text>
      </View>
    </View>
  );
}

/** 权益清单：entitlement 键 → icon + 用户文案（docs/05 §4 键集） */
function benefitsOf(keys: readonly string[], t: TFunction<'membership'>): ReadonlyArray<{
  key: string;
  icon: IconName;
  label: string;
}> {
  return keys.map((key) => {
    if (key === 'catalog.premium.active') return { key, icon: 'palette' as const, label: t('benefitCatalogPremium') };
    if (key.startsWith('skin.official.')) return { key, icon: 'image' as const, label: t('benefitSkinOfficial') };
    if (key === 'room.advanced_slots') return { key, icon: 'sliders' as const, label: t('benefitRoomSlots') };
    if (key === 'insights.advanced') return { key, icon: 'lamp' as const, label: t('benefitInsights') };
    if (key === 'generation.custom.enabled') return { key, icon: 'plus' as const, label: t('benefitCustomGen') };
    // 未登记键：尾段 prettify 兜底，不放生原始 key
    const tail = key.split('.').pop() ?? key;
    return { key, icon: 'check' as const, label: tail.replace(/_/g, ' ') };
  });
}

function BenefitsSection({
  tiers,
  singleTier,
}: Readonly<{
  tiers: readonly MembershipTier[];
  singleTier: boolean;
}>) {
  const { t } = useTranslation('membership');
  const localStyles = useThemeStyles(makeStyles);
  if (tiers.length === 0) return null;
  if (singleTier) {
    return (
      <TierBenefits
        entitlements={tiers[0].entitlements}
        summary={tierDisplaySummary(tiers[0], t)}
      />
    );
  }
  // 多等级：组头 = 等级名，权益列各组自己（服务端目录驱动）
  return (
    <View style={localStyles.tierGroups}>
      {tiers.map((tier) => (
        <View key={tier.id} style={localStyles.tierGroup}>
          <Text style={localStyles.tierGroupName}>{tier.name}</Text>
          <TierBenefits entitlements={tier.entitlements} summary={tierDisplaySummary(tier, t)} />
        </View>
      ))}
    </View>
  );
}

function TierBenefits({
  entitlements,
  summary,
}: Readonly<{ entitlements: readonly string[]; summary: string }>) {
  const { t } = useTranslation('membership');
  const { palette } = usePreferences();
  const localStyles = useThemeStyles(makeStyles);
  // 目录未配权益键时回退等级简介，页面不空置
  if (entitlements.length === 0) {
    if (!summary) return null;
    return <Text style={localStyles.summaryText}>{summary}</Text>;
  }
  return (
    <View style={localStyles.benefitList}>
      {benefitsOf(entitlements, t).map((benefit) => (
        <View key={benefit.key} style={localStyles.benefitRow}>
          <View style={localStyles.benefitIcon}>
            <AppIcon name={benefit.icon} color={palette.actionFocus} size={16} />
          </View>
          <Text style={localStyles.benefitLabel}>{benefit.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** 方案卡：大价格 + 周期 + 推荐角标 + 省钱标签；选中态 = 强调边框 */
function PlanCard({
  plan,
  price,
  selected,
  recommended,
  onSelect,
}: Readonly<{
  plan: BillingPlan;
  price: string;
  selected: boolean;
  recommended: boolean;
  onSelect: () => void;
}>) {
  const { t } = useTranslation('membership');
  const { palette } = usePreferences();
  const localStyles = useThemeStyles(makeStyles);
  const savings = plan.originalPriceMinor !== undefined && plan.originalPriceMinor > plan.priceMinor
    ? Math.round((1 - plan.priceMinor / plan.originalPriceMinor) * 100)
    : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${planDisplayName(plan, t)}，${price}`}
      accessibilityState={{ selected }}
      onPress={onSelect}
      style={({ pressed }) => [
        localStyles.planCard,
        selected
          ? localStyles.planCardSelected
          : localStyles.planCardIdle,
        pressed && localStyles.pressed,
      ]}
    >
      {recommended ? (
        <View style={localStyles.planBadge}>
          <Text style={localStyles.planBadgeText}>{t('planRecommended')}</Text>
        </View>
      ) : null}
      <Text style={localStyles.planName} numberOfLines={1}>{planDisplayName(plan, t)}</Text>
      <Text style={localStyles.planPrice}>{price}</Text>
      {savings !== null && savings > 0 ? (
        <View style={localStyles.planSavings}>
          <Text style={localStyles.planSavingsText}>{t('planSavings', { percent: savings })}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** 已订阅态：渐变会员卡（crown + 等级名 + 生效中/已过期 + 权益 checklist） */
function MemberCard({
  tierName,
  subtitle,
  entitlements,
  summary,
  expired = false,
}: Readonly<{
  tierName: string;
  subtitle: string;
  entitlements: readonly string[];
  summary: string;
  /** 订阅行 expired（webhook 到期/冻结）→ 徽章与底色切警示语义 */
  expired?: boolean;
}>) {
  const { t } = useTranslation('membership');
  const { palette } = usePreferences();
  const localStyles = useThemeStyles(makeStyles);
  const benefits = entitlements.length > 0 ? benefitsOf(entitlements, t) : null;
  return (
    <View style={localStyles.memberCard}>
      {/* 主题渐变底：surface → 品牌蓝 25%，暗色=夜蓝辉光、亮色=暖纸染蓝 */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id={MEMBER_FILL_ID} x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor={palette.surface} />
              <Stop offset="100%" stopColor={palette.actionPrimary} stopOpacity={0.25} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${MEMBER_FILL_ID})`} />
        </Svg>
      </View>
      <View style={localStyles.memberHead}>
        <AppIcon name="crown" color={palette.achievement} size={28} />
        <Text style={localStyles.memberName} numberOfLines={1}>{tierName}</Text>
        <View
          style={[
            localStyles.memberBadge,
            expired && { backgroundColor: palette.warningSoft },
          ]}
        >
          <Text
            style={[
              localStyles.memberBadgeText,
              expired && { color: palette.warning },
            ]}
          >
            {expired ? t('memberBadgeExpired') : t('memberBadgeActive')}
          </Text>
        </View>
      </View>
      <Text style={localStyles.memberSubtitle}>{subtitle}</Text>
      {benefits ? (
        <View style={localStyles.memberBenefits}>
          {benefits.map((benefit) => (
            <View key={benefit.key} style={localStyles.memberBenefitRow}>
              <AppIcon name="check" color={palette.success} size={16} />
              <Text style={localStyles.memberBenefitLabel}>{benefit.label}</Text>
            </View>
          ))}
        </View>
      ) : (
        summary ? <Text style={localStyles.memberSubtitle}>{summary}</Text> : null
      )}
    </View>
  );
}

/** 精选皮肤横滑行（已订阅态）：海报缩略 → 商店（转化位，不直接换肤） */
function SkinsRow() {
  const { t } = useTranslation('membership');
  const { navigate } = useApp();
  const focus = useFocus();
  const localStyles = useThemeStyles(makeStyles);
  return (
    <View>
      <Text style={localStyles.sectionLabel}>{t('sectionSkins')}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={localStyles.skinsRow}
      >
        {focus.skins.slice(0, 8).map((skin) => {
          const poster = storeCardPoster(focus.skins, skin.slug, 'ready')
            ?? { uri: skinPosterUrl(skin.slug, 'thumb') };
          return (
            <Pressable
              key={skin.id}
              accessibilityRole="button"
              accessibilityLabel={t('linkStore')}
              onPress={() => navigate('store.home')}
              style={({ pressed }) => [localStyles.skinThumb, pressed && localStyles.pressed]}
            >
              <Image source={poster} style={imageFill} resizeMode="cover" />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function FooterLink({
  label,
  onPress,
}: Readonly<{ label: string; onPress: () => void }>) {
  const localStyles = useThemeStyles(makeStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
    >
      <Text style={localStyles.linkText}>{label}</Text>
    </Pressable>
  );
}

export function formatPrice(plan: BillingPlan, t: TFunction<'membership'>) {
  const price = new Intl.NumberFormat(currentLanguage(), {
    style: 'currency', currency: plan.currency,
  }).format(plan.priceMinor / 100);
  const period = t(`interval.${plan.interval}`);
  return `${price}/${period}`;
}

const makeStyles = (p: ThemeColors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: p.canvas,
  },
  list: {
    padding: space.x4,
    gap: space.x4,
  },
  sectionLabel: {
    ...type.title3,
    color: p.textPrimary,
    marginTop: space.x2,
  },
  emptyText: {
    ...type.body,
    color: p.textSecondary,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
  // —— 场景 hero ——
  hero: {
    height: 176,
    borderRadius: radii.card,
    overflow: 'hidden',
    backgroundColor: p.surfaceRaised,
  },
  heroScrim: { ...imageFill },
  heroCopy: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: space.x4,
    paddingTop: space.x6,
    gap: 2,
  },
  // 文案压在固定暗纱上：onMedia 主题无关（同商店 banner 语义）
  heroTitle: {
    ...type.title2,
    color: p.onMedia,
  },
  heroSubtitle: {
    ...type.caption,
    color: p.onMediaSecondary,
  },
  // —— 权益清单 ——
  tierGroups: { gap: space.x4 },
  tierGroup: { gap: space.x3 },
  tierGroupName: {
    ...type.bodyStrong,
    color: p.textSecondary,
  },
  summaryText: {
    ...type.body,
    color: p.textSecondary,
  },
  benefitList: { gap: space.x2 },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x3,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: p.borderSoft,
    backgroundColor: p.surface,
    padding: space.x3,
  },
  benefitIcon: {
    width: 28,
    height: 28,
    borderRadius: radii.small,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: p.surfaceRaised,
    borderWidth: 1,
    borderColor: p.borderSoft,
  },
  benefitLabel: {
    ...type.body,
    color: p.textPrimary,
    flexShrink: 1,
  },
  // —— 方案卡 ——
  planRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.x3,
  },
  planCard: {
    flexGrow: 1,
    flexBasis: 140,
    borderRadius: radii.card,
    backgroundColor: p.surface,
    padding: space.x4,
    paddingTop: space.x5,
    gap: 2,
    alignItems: 'center',
  },
  planCardIdle: {
    borderWidth: 2,
    borderColor: p.borderSoft,
  },
  planCardSelected: {
    borderWidth: 2,
    borderColor: p.borderEmphasis,
    backgroundColor: p.surfaceRaised,
  },
  planBadge: {
    position: 'absolute',
    top: space.x2,
    right: space.x2,
    borderRadius: radii.round,
    backgroundColor: p.achievement,
    paddingHorizontal: space.x2,
    paddingVertical: 3,
  },
  planBadgeText: {
    ...type.micro,
    color: p.textPrimary,
    fontWeight: '700',
  },
  planName: {
    ...type.label,
    color: p.textSecondary,
  },
  planPrice: {
    ...type.title1,
    color: p.textPrimary,
  },
  planSavings: {
    marginTop: space.x1,
    borderRadius: radii.round,
    backgroundColor: p.brandSoft,
    paddingHorizontal: space.x2,
    paddingVertical: 3,
  },
  planSavingsText: {
    ...type.micro,
    color: p.actionFocus,
    fontWeight: '700',
  },
  // —— 粘性底栏 ——
  footer: {
    paddingTop: space.x3,
    paddingHorizontal: space.x4,
    gap: space.x3,
    borderTopWidth: 1,
    borderTopColor: p.borderSoft,
    backgroundColor: p.canvas,
  },
  mockNotice: {
    ...type.caption,
    color: p.warning,
    textAlign: 'center',
  },
  linksRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: space.x2,
    rowGap: space.x1,
  },
  linkText: {
    ...type.caption,
    color: p.textMuted,
  },
  linkDot: {
    ...type.caption,
    color: p.textMuted,
  },
  // —— 会员卡（已订阅态）——
  memberCard: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: p.borderSoft,
    overflow: 'hidden',
    padding: space.x5,
    gap: space.x3,
  },
  memberHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x3,
  },
  memberName: {
    ...type.title2,
    color: p.textPrimary,
    flexShrink: 1,
  },
  memberBadge: {
    marginLeft: 'auto',
    borderRadius: radii.round,
    backgroundColor: p.successSoft,
    paddingHorizontal: space.x3,
    paddingVertical: space.x1,
  },
  memberBadgeText: {
    ...type.micro,
    color: p.success,
    fontWeight: '700',
  },
  memberSubtitle: {
    ...type.caption,
    color: p.textSecondary,
  },
  memberBenefits: {
    gap: space.x2,
    marginTop: space.x1,
  },
  memberBenefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x2,
  },
  memberBenefitLabel: {
    ...type.body,
    color: p.textPrimary,
    flexShrink: 1,
  },
  memberActions: {
    flexDirection: 'row',
    gap: space.x3,
  },
  memberAction: { flex: 1 },
  // —— 精选皮肤行 ——
  skinsRow: { gap: space.x3 },
  skinThumb: {
    width: 120,
    height: 88,
    borderRadius: radii.control,
    overflow: 'hidden',
    backgroundColor: p.surfaceRaised,
    borderWidth: 1,
    borderColor: p.borderSoft,
  },
});
