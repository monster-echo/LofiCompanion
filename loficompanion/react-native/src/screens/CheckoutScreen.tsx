import React from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
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
          {/* 自动续期披露（App Store 审核指南 3.1.2 / Play 支付政策）：名称/价格/周期
              复用 formatPrice，计费账户按平台区分；必须渲染在「确认订阅」按钮之前 */}
          <Text style={styles.secondary}>{t('checkoutDisclosureTitle')}</Text>
          <Text style={styles.caption}>
            {t('checkoutDisclosure', {
              plan: plan?.name ?? planId ?? '',
              price: plan ? formatPrice(plan, t) : '',
              store: Platform.OS === 'android' ? t('storeGoogle') : t('storeApple'),
            })}
          </Text>
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
