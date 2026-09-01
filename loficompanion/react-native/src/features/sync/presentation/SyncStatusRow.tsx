import React from 'react';
import { Pressable, Text } from 'react-native';
import { semantic, type } from '../../../theme/tokens';
import { useSync } from '../application/SyncStore';
import { useTranslation } from 'react-i18next';
import { i18n } from '../../../i18n/core';

// 设置页「同步」状态行：点击手动补同步（幂等，安全重试）。
export function SyncStatusRow() {
  const { t } = useTranslation('common');
  const { state, syncNow } = useSync();
  const label = state.status === 'syncing'
    ? t('syncInProgress')
    : state.status === 'synced'
      ? t('syncDone')
      : state.status === 'offline'
        ? t('syncSignInHint')
        : state.status === 'error'
          ? i18n.t('errors:tryAgain')
          : i18n.t('common:syncDone');
  const color = state.status === 'error' ? semantic.danger : semantic.textMuted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('syncNow')}
      onPress={() => { void syncNow(); }}
      hitSlop={8}
      style={{ paddingVertical: 6 }}
    >
      <Text style={{ ...type.caption, color }}>{label}</Text>
    </Pressable>
  );
}
