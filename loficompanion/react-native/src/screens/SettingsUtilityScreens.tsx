import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import {
  AppButton,
  AppCard,
  ListRow,
  PageHeader,
} from '../design-system/components';
import { useStorageMaintenance, openSystemSettings } from '../settings/useStorageMaintenance';
import { useApp } from '../state/AppStore';
import { styles } from '../theme/styles';
import { useTranslation } from 'react-i18next';

export function TextSizeScreen() {
  const { user, saveSettings, busy } = useApp();
  const { t } = useTranslation('settings');
  const [scale, setScale] = useState(Number(user?.settings.textScale ?? 1));
  const options = [
    { value: 0.9, label: t('textSizeSmall') },
    { value: 1, label: t('textSizeStandard') },
    { value: 1.15, label: t('textSizeLarge') },
    { value: 1.3, label: t('textSizeXlarge') },
  ] as const;
  return (
    <View style={styles.page}>
      <PageHeader title={t('textSize')} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <AppCard>
          <Text style={[styles.body, { fontSize: 16 * scale }]}>
            {t('textSizePreview')}
          </Text>
        </AppCard>
        <AppCard>
          {options.map((option) => (
            <ListRow
              key={option.value}
              label={option.label}
              onPress={() => setScale(option.value)}
              value={scale === option.value ? t('selected') : ''}
            />
          ))}
        </AppCard>
        <AppButton
          disabled={busy || !user}
          label={busy ? t('saving') : t('saveTextSize')}
          onPress={() => void saveSettings({ textScale: scale })}
        />
      </ScrollView>
    </View>
  );
}

export function StorageScreen() {
  const storage = useStorageMaintenance();
  const { showConfirm, showToast } = useApp();
  const { t } = useTranslation('settings');
  const clearCache = () => showConfirm({
    title: t('storageClearConfirmTitle'),
    message: t('storageClearConfirmMessage'),
    confirmLabel: t('storageClearConfirmAction'),
    onConfirm: async () => {
      try {
        const result = await storage.clear();
        const detail = result.bytesFreed
          ? t('storageFreedSize', { size: formatBytes(result.bytesFreed) })
          : t('storageNothingToClear');
        showToast(t('storageCleared', { detail }), 'success');
      } catch {
        showToast(t('storageClearFailed'), 'error');
      }
    },
  });
  return (
    <View style={styles.page}>
      <PageHeader title={t('storage')} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <AppCard>
          <ListRow label={t('storageLocalKeys')} value={String(storage.summary?.keys ?? 0)} />
          <ListRow label={t('storageLocalSize')} value={formatBytes(storage.summary?.bytes ?? 0)} />
        </AppCard>
        <Text style={styles.secondary}>
          {t('storageClearHint')}
        </Text>
        <AppButton
          disabled={storage.loading}
          label={storage.loading ? t('processing') : t('storageClearAction')}
          onPress={clearCache}
          variant="secondary"
        />
      </ScrollView>
    </View>
  );
}

export function PermissionsScreen() {
  const { showToast } = useApp();
  const { t } = useTranslation('settings');
  const openSettings = async () => {
    if (!await openSystemSettings()) {
      showToast(t('permissionsWebHint'), 'info');
    }
  };
  return (
    <View style={styles.page}>
      <PageHeader title={t('permissions')} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <AppCard>
          <Text style={styles.heading}>{t('permissionsDeviceManaged')}</Text>
          <Text style={styles.secondary}>
            {t('permissionsDescription')}
          </Text>
        </AppCard>
        <AppButton
          label={t('openSystemSettings')}
          onPress={() => void openSettings()}
          variant="secondary"
        />
      </ScrollView>
    </View>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}
