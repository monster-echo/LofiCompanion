import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppButton, AppCard, PageHeader } from '../design-system/components';
import { useApp } from '../state/AppStore';
import { styles } from '../theme/styles';
import { formatPrice } from './MembershipScreen';

export function CheckoutScreen() {
  const { t } = useTranslation('membership');
  const { config, navigate, purchaseState, purchase, busy, pendingPlanId } = useApp();
  const planId = pendingPlanId;
  const plan = config.plans.find((p) => p.id === planId);
  const start = async () => {
    if (!planId) return;
    await purchase(planId);
  };
  const st = purchaseState?.kind;
  return (
    <View style={styles.page}>
      <PageHeader title={t('checkoutTitle')} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <AppCard>
          <Text style={styles.heading}>{plan?.name ?? planId}</Text>
          {plan ? <Text style={styles.secondary}>{formatPrice(plan, t)}</Text> : null}
          {plan?.provider === 'mock' ? <Text style={styles.caption}>{t('checkoutMockNotice')}</Text> : null}
        </AppCard>
        {st === 'loading' ? (
          <AppButton disabled label={t('confirming')} icon="crown" onPress={() => {}} />
        ) : st === 'success' ? (
          <AppButton label={t('done')} icon="check" onPress={() => navigate('membership.home')} />
        ) : st === 'failed' ? (
          <AppButton label={t('retry')} icon="crown" onPress={() => void start()} />
        ) : (
          <AppButton disabled={busy} label={t('confirmSubscribe')} icon="crown" onPress={() => void start()} />
        )}
      </ScrollView>
    </View>
  );
}
