import React, { useEffect, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import {
  AppButton, AppCard, ListRow, OfflineBanner, PageHeader,
} from '../design-system/components';
import { SessionView } from '../domain/models';
import { AppRoute } from '../navigation/routes';
import { TranslationKey, usePreferences } from '../preferences/PreferencesProvider';
import { useApp } from '../state/AppStore';
import { SyncStatusRow } from '../features/sync/presentation/SyncStatusRow';
import { styles } from '../theme/styles';
import { useTranslation } from 'react-i18next';

type SettingItem = Readonly<{
  policy?: string;
  label: TranslationKey;
  route: AppRoute;
  value?: string;
}>;
type SettingGroup = Readonly<{ title: TranslationKey; items: readonly SettingItem[] }>;

const groups: readonly SettingGroup[] = [
  { title: 'accountServices', items: [
    { label: 'accountSecurity', route: 'settings.accountSecurity' },
    { label: 'devices', route: 'settings.devices' },
    { label: 'membership', route: 'membership.home' },
  ] },
  { title: 'appPreferences', items: [
    { policy: 'notifications', label: 'notifications', route: 'settings.notifications' },
    { policy: 'general', label: 'general', route: 'settings.general' },
    { policy: 'appearance', label: 'appearance', route: 'settings.appearance' },
    { policy: 'language', label: 'language', route: 'settings.language' },
    { policy: 'appearance', label: 'textSize', route: 'settings.textSize' },
  ] },
  { title: 'privacySupport', items: [
    { policy: 'analytics', label: 'privacy', route: 'settings.privacy' },
    { label: 'permissions', route: 'settings.permissions' },
    { label: 'storage', route: 'settings.storage' },
    { label: 'help', route: 'settings.helpFeedback' },
    { label: 'legal', route: 'settings.legal' },
    { label: 'about', route: 'settings.about', value: '1.0.0' },
    { policy: 'accountDeletion', label: 'deleteAccount', route: 'settings.deleteAccount' },
  ] },
];

export function SettingsScreen() {
  const { config, user } = useApp();
  const { text } = usePreferences();
  const { t } = useTranslation('settings');
  const visible = (item: SettingItem) => !item.policy
    || config.settingsPolicy[item.policy]?.visibility === 'visible';
  return (
    <View style={styles.page}>
      <OfflineBanner />
      <PageHeader title={text('settings')} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <AppCard>
          <Text style={styles.heading}>{user?.displayName ?? text('guest')}</Text>
          <Text style={styles.secondary}>
            {user ? (user.hasEmail && user.email ? user.email : t('emailNotBound')) : text('signInSync')}
          </Text>
          <SyncStatusRow />
        </AppCard>
        {groups.map((group) => (
          <View key={group.title}>
            <Text style={styles.sectionLabel}>{text(group.title)}</Text>
            <AppCard>{group.items.filter(visible).map((item) => (
              <ListRow
                key={item.route}
                label={text(item.label)}
                route={item.route}
                value={settingValue(item, user?.settings, text)}
              />
            ))}</AppCard>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function settingValue(
  item: SettingItem,
  settings: Readonly<Record<string, unknown>> | undefined,
  text: (key: TranslationKey) => string,
) {
  if (item.value) return item.value;
  if (item.route === 'settings.appearance') {
    return { system: text('system'), light: text('light'), dark: text('dark') }[
      String(settings?.theme ?? 'system')
    ];
  }
  if (item.route === 'settings.language') {
    return settings?.language === 'en-US' ? text('english') : text('chinese');
  }
  return undefined;
}

export function AccountSecurityScreen() {
  const { user, changePassword, busy, navigate, showToast } = useApp();
  const { palette } = usePreferences();
  const { t } = useTranslation('settings');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const submit = async () => {
    if (await changePassword(current, next)) {
      showToast(t('passwordChanged'), 'success');
      navigate('auth.signIn');
    }
  };
  return (
    <View style={styles.page}>
      <PageHeader title={t('accountSecurity')} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <AppCard>
          <ListRow
            label={t('loginEmail')}
            value={user ? (user.hasEmail && user.email ? user.email : t('emailNotBound')) : t('notSignedIn')}
          />
          <ListRow label={t('identityBinding')} value={t('emailPassword')} />
        </AppCard>
        <TextInput
          accessibilityLabel={t('currentPassword')}
          onChangeText={setCurrent}
          placeholder={t('currentPassword')}
          placeholderTextColor={palette.placeholder}
          secureTextEntry
          style={styles.input}
          value={current}
        />
        <TextInput
          accessibilityLabel={t('newPassword')}
          onChangeText={setNext}
          placeholder={t('newPasswordHint')}
          placeholderTextColor={palette.placeholder}
          secureTextEntry
          style={styles.input}
          value={next}
        />
        <AppButton
          disabled={busy || !user}
          label={busy ? t('changingPassword') : t('changePassword')}
          icon="lock"
          onPress={() => void submit()}
        />
      </ScrollView>
    </View>
  );
}

export function DevicesScreen() {
  const { loadSessions, revokeSession, user } = useApp();
  const { t } = useTranslation('settings');
  const [sessions, setSessions] = useState<readonly SessionView[]>([]);
  useEffect(() => {
    if (user) void loadSessions().then(setSessions);
  }, [loadSessions, user]);
  const revoke = async (id: string) => {
    if (await revokeSession(id)) setSessions((items) => items.filter((item) => item.id !== id));
  };
  return (
    <View style={styles.page}>
      <PageHeader title={t('devicesTitle')} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {sessions.map((session) => (
          <AppCard key={session.id}>
            <ListRow
              label={session.deviceName}
              value={session.current ? t('currentDevice') : t('revoke')}
              onPress={session.current ? undefined : () => void revoke(session.id)}
            />
            <Text style={styles.caption}>{t('lastActiveAt', { time: formatDate(session.lastSeenAt) })}</Text>
          </AppCard>
        ))}
        {!sessions.length ? <Text style={styles.secondary}>{t('noSessions')}</Text> : null}
      </ScrollView>
    </View>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('zh-CN');
}
