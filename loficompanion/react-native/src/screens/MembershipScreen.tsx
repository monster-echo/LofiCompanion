import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { AppButton, AppCard, ListRow, PageHeader } from '../design-system/components';
import { RestoreRow } from './MembershipRestoreRow';
import { BillingPlan, MembershipTier } from '../domain/models';
import { useApp } from '../state/AppStore';
import { membershipAccents, radii, spacing } from '../theme/tokens';
import type { ThemeColors } from '../theme/tokens';
import { styles } from '../theme/styles';
import { useThemeStyles } from '../theme/useThemeStyles';

export function MembershipScreen() {
  const { t } = useTranslation('membership');
  const { config, user, navigate, busy, setPendingPlanId, setPurchaseState } = useApp();
  const [selected, setSelected] = useState(config.plans[0]?.id ?? '');
  const selectedPlan = config.plans.find((plan) => plan.id === selected);
  const buy = () => {
    if (!user) { navigate('auth.signIn'); return; }
    if (!selected) return;
    setPurchaseState({ kind: 'idle' });
    setPendingPlanId(selected);
    navigate('membership.checkout');
  };
  return (
    <View style={styles.page}>
      <PageHeader title={t('title')} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <MembershipHero tiers={config.tiers.length} plans={config.plans.length} />
        {config.tiers.map((tier) => (
          <TierCard key={tier.id} tier={tier} current={user?.tierId === tier.id} />
        ))}
        <Text style={styles.sectionLabel}>{t('sectionPlans')}</Text>
        {config.plans.map((plan, index) => (
          <PlanCard
            key={plan.id}
            accent={membershipAccents[Math.min(index, membershipAccents.length - 1)]}
            plan={plan}
            selected={selected === plan.id}
            select={() => setSelected(plan.id)}
          />
        ))}
        {config.plans.length ? (
          <>
            {selectedPlan?.provider === 'mock' ? (
              <AppCard>
                <Text style={styles.secondary}>{t('mockNotice')}</Text>
              </AppCard>
            ) : null}
            <AppButton
              disabled={busy}
              label={busy
                ? t('confirming')
                : !user
                  ? t('signInToSubscribe')
                  : selectedPlan?.provider === 'mock'
                    ? t('mockOrder')
                    : t('confirmSubscribe')}
              icon="crown"
              onPress={() => buy()}
            />
          </>
        ) : <Text style={styles.secondary}>{t('emptyPlans')}</Text>}
        {/* P1-A S16 轻量补充（计划 Task 3）：Plus 皮肤目录价值文案 + 商店联动
            入口——Plus 精选皮肤由 catalog.premium.active 权益键解锁。 */}
        <ListRow
          label={t('browsePlusSkins')}
          value={t('plusSkinValue')}
          icon="palette"
          onPress={() => navigate('store.home')}
        />
        <ListRow label={t('viewOrders')} route="membership.orders" icon="gift" />
        <RestoreRow />
      </ScrollView>
    </View>
  );
}

function MembershipHero({ tiers, plans }: Readonly<{ tiers: number; plans: number }>) {
  const { t } = useTranslation('membership');
  const localStyles = useThemeStyles(makeStyles);
  return (
    <View style={localStyles.proHero}>
      <Text style={localStyles.proLabel}>MEMBERSHIP</Text>
      <Text style={localStyles.proTitle}>{t('heroTitle')}</Text>
      <Text style={localStyles.proBody}>{t('heroBody', { tiers, plans })}</Text>
    </View>
  );
}

function TierCard({ tier, current }: Readonly<{ tier: MembershipTier; current: boolean }>) {
  const { t } = useTranslation('membership');
  const localStyles = useThemeStyles(makeStyles);
  return (
    <AppCard>
      <View style={localStyles.tierHeading}>
        <Text style={styles.heading}>{tier.name}</Text>
        <Text style={current ? localStyles.currentTag : styles.caption}>
          {current ? t('tierCurrent') : tier.recommended ? t('tierRecommended') : ''}
        </Text>
      </View>
      <Text style={styles.secondary}>{tier.summary}</Text>
      <Text style={styles.caption}>{t('entitlementsCount', { n: tier.entitlements.length })}</Text>
    </AppCard>
  );
}

function PlanCard({ accent, plan, selected, select }: Readonly<{
  accent: string;
  plan: BillingPlan;
  selected: boolean;
  select: () => void;
}>) {
  const { t } = useTranslation('membership');
  return (
    <AppCard>
      <ListRow
        label={plan.name}
        value={formatPrice(plan, t)}
        onPress={select}
        icon={selected ? 'check' : 'crown'}
        iconColor={accent}
      />
      <Text style={styles.caption}>
        {selected ? t('planSelected') : t('planProvider', { provider: plan.provider })}
      </Text>
    </AppCard>
  );
}

export function formatPrice(plan: BillingPlan, t: TFunction<'membership'>) {
  const price = new Intl.NumberFormat('zh-CN', {
    style: 'currency', currency: plan.currency,
  }).format(plan.priceMinor / 100);
  const period = t(`interval.${plan.interval}`);
  return `${price}/${period}`;
}

const makeStyles = (p: ThemeColors) => StyleSheet.create({
  tierHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  currentTag: { color: p.success, fontSize: 12, fontWeight: '700' },
  proHero: {
    borderRadius: radii.card, padding: spacing.x6, gap: spacing.x3, backgroundColor: p.text,
  },
  proLabel: { color: p.brand, fontWeight: '700', letterSpacing: 2 },
  proTitle: { color: p.surface, fontSize: 26, fontWeight: '700' },
  proBody: { color: p.border, fontSize: 14 },
});
