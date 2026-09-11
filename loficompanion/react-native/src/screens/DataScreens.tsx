import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  AppCard,
  ListRow,
  OfflineBanner,
  PageHeader,
} from '../design-system/components';
import { NotificationItem } from '../domain/models';
import { AppRoute } from '../navigation/routes';
import { useApp } from '../state/AppStore';
import { styles } from '../theme/styles';
import { NotificationCard } from '../notifications/NotificationCard';
import { spacing } from '../theme/tokens';
import { useTranslation } from 'react-i18next';

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

// 订单页已迁至 features/orders（OrderCenterScreen，订单中心）。

export function AboutScreen() {
  const { config, online } = useApp();
  const { t } = useTranslation('profile');
  return (
    <View style={styles.page}>
      <PageHeader title={t('aboutTitle')} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <AppCard>
          <Text style={styles.heading}>{config.brand.appName}</Text>
          {/* 服务端 tagline 当前只下发中文，文案走 i18n（键与内置/服务端值同步维护） */}
          <Text style={styles.secondary}>{t('brandTagline')}</Text>
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

const notificationStyles = StyleSheet.create({
  toolbar: {
    minHeight: 56,
    justifyContent: 'center',
    gap: spacing.x1,
  },
});
