import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  AppCard,
  ListRow,
  OfflineBanner,
  PageHeader,
} from '../design-system/components';
import { NotificationItem, OrderView } from '../domain/models';
import type { OrderStatus } from '../payment/paymentModels';
import { AppRoute } from '../navigation/routes';
import { useApp } from '../state/AppStore';
import { styles } from '../theme/styles';
import { NotificationCard } from '../notifications/NotificationCard';
import { spacing } from '../theme/tokens';
import { useTranslation } from 'react-i18next';
import { i18n } from '../i18n/core';

export function NotificationsScreen() {
  const {
    user,
    loadNotifications,
    markNotificationsRead,
    markNotificationRead,
    navigate,
  } = useApp();
  const { t } = useTranslation('profile');
  const [items, setItems] = useState<readonly NotificationItem[]>([]);
  useEffect(() => {
    if (user) void loadNotifications().then(setItems);
  }, [loadNotifications, user]);
  const readAll = async () => {
    await markNotificationsRead();
    const timestamp = new Date().toISOString();
    setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? timestamp })));
  };
  const open = async (item: NotificationItem) => {
    if (!item.readAt) {
      await markNotificationRead(item.id);
      const timestamp = new Date().toISOString();
      setItems((current) => current.map((value) => (
        value.id === item.id ? { ...value, readAt: timestamp } : value
      )));
    }
    if (isAppRoute(item.route)) navigate(item.route);
  };
  const unreadCount = items.filter((item) => !item.readAt).length;
  return (
    <View style={styles.page}>
      <OfflineBanner />
      <PageHeader
        title={t('notificationsTitle')}
        rightAction={items.length ? {
          label: t('markAllRead'),
          onPress: () => void readAll(),
          disabled: unreadCount === 0,
        } : undefined}
      />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {items.length ? (
          <View style={notificationStyles.toolbar}>
            <View>
              <Text style={styles.heading}>{t('latestNotifications')}</Text>
              <Text style={styles.caption}>
                {t('notificationCounts', { total: items.length, unread: unreadCount })}
              </Text>
            </View>
          </View>
        ) : null}
        {items.map((item) => (
          <NotificationCard key={item.id} item={item} onPress={() => void open(item)} />
        ))}
        {!items.length ? (
          <Text style={styles.secondary}>{user ? t('notificationsEmpty') : t('notificationsSignInRequired')}</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

export function OrdersScreen() {
  const { user, loadOrders } = useApp();
  const { t } = useTranslation('profile');
  const [orders, setOrders] = useState<readonly OrderView[]>([]);
  useEffect(() => {
    if (user) void loadOrders().then(setOrders);
  }, [loadOrders, user]);
  return (
    <View style={styles.page}>
      <PageHeader title={t('rowOrders')} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {orders.map((order) => (
          <AppCard key={order.id}>
            <ListRow label={order.planId} value={statusLabel(order.status)} />
            <Text style={styles.secondary}>
              {formatMoney(order.amountMinor, order.currency)} · {order.provider}
            </Text>
            <Text style={styles.caption}>{formatDate(order.createdAt)}</Text>
          </AppCard>
        ))}
        {!orders.length ? (
          <Text style={styles.secondary}>{user ? t('ordersEmpty') : t('ordersSignInRequired')}</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

export function AboutScreen() {
  const { config, online } = useApp();
  const { t } = useTranslation('profile');
  return (
    <View style={styles.page}>
      <PageHeader title={t('aboutTitle')} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <AppCard>
          <Text style={styles.heading}>{config.brand.appName}</Text>
          <Text style={styles.secondary}>{config.brand.tagline}</Text>
        </AppCard>
        <AppCard>
          <ListRow label={t('clientVersion')} value="1.0.0" />
          <ListRow label={t('configVersion')} value={`v${config.version}`} />
          <ListRow label={t('configSchema')} value={`v${config.schemaVersion}`} />
          <ListRow label={t('serviceStatus')} value={online ? t('statusOnline') : t('statusOfflineCache')} />
        </AppCard>
      </ScrollView>
    </View>
  );
}

function isAppRoute(value: string | null): value is AppRoute {
  return Boolean(value && !value.includes('://'));
}

// 模块级工具（非组件）：文案在渲染/构造时经 i18n 实例解析，不在顶层取值。
const statusLabel = (status: OrderStatus): string => ({
  pending: i18n.t('profile:orderPending'),
  processing: i18n.t('profile:orderProcessing'),
  success: i18n.t('profile:orderSuccess'),
  failed: i18n.t('profile:orderFailed'),
  refunded: i18n.t('profile:orderRefunded'),
}[status] ?? status);

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency }).format(amount / 100);
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('zh-CN');
}

const notificationStyles = StyleSheet.create({
  toolbar: {
    minHeight: 56,
    justifyContent: 'center',
    gap: spacing.x1,
  },
});
