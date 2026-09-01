import React, { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { AppButton, AppCard, ListRow, PageHeader, ToggleRow } from '../design-system/components';
import { usePreferences } from '../preferences/PreferencesProvider';
import { useApp } from '../state/AppStore';
import { styles } from '../theme/styles';
import { i18n } from '../i18n/core';
import { saveLocaleOverride } from '../data/storage';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

export type PreferenceKind = 'notifications' | 'general' | 'privacy' | 'appearance' | 'language';

export function PreferenceScreen({ kind, title }: Readonly<{
  kind: PreferenceKind;
  title: string;
}>) {
  const { user, saveSettings, busy, showToast } = useApp();
  const { text } = usePreferences();
  const initial = preferenceInitial(kind, user?.settings);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [option, setOption] = useState(initial.option);
  const save = async () => {
    if (await saveSettings(preferencePatch(kind, enabled, option))) {
      showToast(text('saved'), 'success');
    }
  };
  const pageTitle = kind === 'appearance' ? text('appearance')
    : kind === 'language' ? text('language')
    : kind === 'notifications' ? text('notifications')
    : kind === 'general' ? text('general')
    : kind === 'privacy' ? text('privacy')
    : title;
  return (
    <View style={styles.page}>
      <PageHeader title={pageTitle} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <AppCard>
          <PreferenceFields
            enabled={enabled}
            kind={kind}
            option={option}
            setEnabled={setEnabled}
            setOption={setOption}
          />
        </AppCard>
        <AppButton
          disabled={busy || !user}
          label={busy ? text('saving') : text('save')}
          icon="check"
          onPress={() => void save()}
        />
      </ScrollView>
    </View>
  );
}

function PreferenceFields({ enabled, kind, option, setEnabled, setOption }: Readonly<{
  enabled: boolean;
  kind: PreferenceKind;
  option: string;
  setEnabled: (value: boolean) => void;
  setOption: (value: string) => void;
}>) {
  const { text } = usePreferences();
  const { t } = useTranslation('settings');
  const { user } = useApp();
  // 语言选择的访客路径：无 Save 按钮（登录才同步服务端），行点按即时生效
  // 并本地持久化；登录用户仍走底部 Save（PUT 服务端 → Provider 解析链生效）。
  const chooseLanguage = (value: 'zh-CN' | 'en-US') => {
    setOption(value);
    if (!user) {
      void saveLocaleOverride(value);
      void i18n.changeLanguage(value);
    }
  };
  if (kind === 'appearance') return <>
    {(['system', 'light', 'dark'] as const).map((value) => (
      <ListRow
        key={value}
        label={text(value)}
        onPress={() => setOption(value)}
        value={option === value ? text('selected') : ''}
      />
    ))}
  </>;
  if (kind === 'language') return <>
    <ListRow label={text('chinese')} onPress={() => chooseLanguage('zh-CN')} value={option === 'zh-CN' ? text('selected') : ''} />
    <ListRow label={text('english')} onPress={() => chooseLanguage('en-US')} value={option === 'en-US' ? text('selected') : ''} />
  </>;
  return <ToggleRow label={preferenceLabel(kind, t)} value={enabled} onChange={setEnabled} />;
}

function preferenceInitial(kind: PreferenceKind, settings?: Readonly<Record<string, unknown>>) {
  if (kind === 'appearance') return { enabled: true, option: String(settings?.theme ?? 'system') };
  if (kind === 'language') return { enabled: true, option: String(settings?.language ?? 'zh-CN') };
  const key = kind === 'notifications' ? 'notificationsEnabled'
    : kind === 'privacy' ? 'analyticsEnabled' : 'autoplayEnabled';
  return { enabled: settings?.[key] !== false, option: '' };
}

function preferencePatch(
  kind: PreferenceKind,
  enabled: boolean,
  option: string,
): Readonly<Record<string, string | number | boolean>> {
  if (kind === 'appearance') return { theme: option };
  if (kind === 'language') return { language: option };
  if (kind === 'notifications') return { notificationsEnabled: enabled };
  if (kind === 'privacy') return { analyticsEnabled: enabled };
  return { autoplayEnabled: enabled };
}

function preferenceLabel(kind: PreferenceKind, t: TFunction<'settings'>) {
  if (kind === 'notifications') return t('prefInAppNotifications');
  if (kind === 'privacy') return t('prefAnonymousAnalytics');
  return t('prefAutoplayRecommendations');
}

export function DeleteAccountScreen() {
  const { deleteAccount, busy, replace, showConfirm } = useApp();
  const { t } = useTranslation('settings');
  const [password, setPassword] = useState('');
  const requestDeletion = () => showConfirm({
    title: t('deleteAccountConfirmTitle'),
    message: t('deleteAccountConfirmMessage'),
    confirmLabel: t('deleteAccountConfirmAction'),
    onConfirm: async () => { if (await deleteAccount(password)) replace('home'); },
  });
  return (
    <View style={styles.page}>
      <PageHeader title={t('deleteAccountTitle')} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.secondary}>{t('deleteAccountReauthHint')}</Text>
        <TextInput
          accessibilityLabel={t('currentPassword')}
          onChangeText={setPassword}
          placeholder={t('currentPassword')}
          secureTextEntry
          style={styles.input}
          value={password}
        />
        <AppButton
          disabled={busy || !password}
          label={t('deleteAccountAction')}
          icon="trash"
          variant="danger"
          onPress={requestDeletion}
        />
      </ScrollView>
    </View>
  );
}
