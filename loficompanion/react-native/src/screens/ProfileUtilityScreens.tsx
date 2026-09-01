import React, { useEffect, useState } from 'react';
import { ScrollView, Share, Text, View } from 'react-native';
import { AppButton, AppCard, ListRow, PageHeader } from '../design-system/components';
import { CouponView, ReferralView, UsageSummary } from '../domain/models';
import { useApp } from '../state/AppStore';
import { styles } from '../theme/styles';
import { useTranslation } from 'react-i18next';
import { i18n } from '../i18n/core';

type ViewState<T> =
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'success'; data: T }>
  | Readonly<{ status: 'empty' }>
  | Readonly<{ status: 'error'; message: string }>;

export function StatisticsScreen() {
  const { loadUsage } = useApp();
  const { t } = useTranslation('profile');
  const [state, setState] = useState<ViewState<UsageSummary>>({ status: 'loading' });
  useEffect(() => { void load(loadUsage, setState, (value) => value.screens.length === 0); }, [loadUsage]);
  return (
    <View style={styles.page}>
      <PageHeader title={t('rowStatistics')} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <StateMessage state={state} retry={() => void load(loadUsage, setState, () => false)} />
        {state.status === 'success' ? <UsageContent usage={state.data} /> : null}
        {state.status === 'empty' ? <Text style={styles.secondary}>{t('statisticsEmpty')}</Text> : null}
      </ScrollView>
    </View>
  );
}

function UsageContent({ usage }: Readonly<{ usage: UsageSummary }>) {
  const { t } = useTranslation('profile');
  return (
    <>
      <AppCard>
        <ListRow label={t('statSessions')} value={String(usage.sessions)} />
        <ListRow label={t('statScreenViews')} value={String(usage.screenViews)} />
        <ListRow label={t('statActiveMinutes')} value={t('statMinutes', { n: usage.activeMinutes })} />
      </AppCard>
      {usage.screens.map((screen) => (
        <AppCard key={screen.screenId}>
          <ListRow label={screen.screenId} value={t('timesCount', { n: screen.views })} />
          <Text style={styles.caption}>{t('durationSeconds', { n: Math.round(screen.durationMs / 1000) })}</Text>
        </AppCard>
      ))}
    </>
  );
}

export function CouponsScreen() {
  const { loadCoupons } = useApp();
  const { t } = useTranslation('profile');
  const [state, setState] = useState<ViewState<readonly CouponView[]>>({ status: 'loading' });
  useEffect(() => { void load(loadCoupons, setState, (items) => items.length === 0); }, [loadCoupons]);
  return (
    <View style={styles.page}>
      <PageHeader title={t('rowCoupons')} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <StateMessage state={state} retry={() => void load(loadCoupons, setState, (items) => !items.length)} />
        {state.status === 'empty' ? <Text style={styles.secondary}>{t('couponsEmpty')}</Text> : null}
        {state.status === 'success' ? state.data.map((coupon) => <CouponCard key={coupon.id} coupon={coupon} />) : null}
      </ScrollView>
    </View>
  );
}

function CouponCard({ coupon }: Readonly<{ coupon: CouponView }>) {
  const { t } = useTranslation('profile');
  const status = coupon.usedAt ? t('couponUsed') : coupon.expiresAt && Date.parse(coupon.expiresAt) < Date.now() ? t('couponExpired') : t('couponActive');
  return (
    <AppCard>
      <Text style={styles.heading}>{coupon.title}</Text>
      <Text style={styles.body}>{coupon.discountLabel}</Text>
      <ListRow label={t('couponCode')} value={coupon.code} />
      <Text style={styles.caption}>{status}</Text>
    </AppCard>
  );
}

export function InviteScreen() {
  const { loadReferral } = useApp();
  const { t } = useTranslation('profile');
  const [state, setState] = useState<ViewState<ReferralView>>({ status: 'loading' });
  useEffect(() => { void load(loadReferral, setState, () => false); }, [loadReferral]);
  const share = async (referral: ReferralView) => {
    await Share.share({ message: t('shareInvite', { code: referral.code, url: referral.shareUrl }) });
  };
  return (
    <View style={styles.page}>
      <PageHeader title={t('rowInvite')} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <StateMessage state={state} retry={() => void load(loadReferral, setState, () => false)} />
        {state.status === 'success' ? (
          <AppCard>
            <Text style={styles.sectionLabel}>{t('myInviteCode')}</Text>
            <Text selectable style={styles.title}>{state.data.code}</Text>
            <Text style={styles.secondary}>{t('invitedCount', { n: state.data.invited })}</Text>
            <AppButton label={t('shareInviteAction')} icon="gift" onPress={() => void share(state.data)} />
          </AppCard>
        ) : null}
      </ScrollView>
    </View>
  );
}

function StateMessage<T>({ state, retry }: Readonly<{ state: ViewState<T>; retry: () => void }>) {
  const { t } = useTranslation('profile');
  if (state.status === 'loading') return <Text style={styles.secondary}>{t('loading')}</Text>;
  if (state.status !== 'error') return null;
  return (
    <AppCard>
      <Text style={styles.secondary}>{state.message}</Text>
      <AppButton label={t('retry')} icon="alert" onPress={retry} variant="secondary" />
    </AppCard>
  );
}

async function load<T>(
  operation: () => Promise<T>,
  update: React.Dispatch<React.SetStateAction<ViewState<T>>>,
  empty: (value: T) => boolean,
) {
  update({ status: 'loading' });
  try {
    const value = await operation();
    update(empty(value) ? { status: 'empty' } : { status: 'success', data: value });
  } catch (error) {
    update({ status: 'error', message: error instanceof Error ? error.message : i18n.t('profile:loadFailed') });
  }
}
