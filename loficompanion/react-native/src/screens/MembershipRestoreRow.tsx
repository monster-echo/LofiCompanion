import React, { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useApp } from '../state/AppStore';
import { space, type, type ThemeColors } from '../theme/tokens';
import { useThemeStyles } from '../theme/useThemeStyles';

/**
 * 恢复购买（App Store 审核要求项）：商店已购 → 服务端按票据重验 →
 * 权益合并。无已购时静默提示，不报错误。
 * 2026-09 会员中心改版：入口从 ListRow 降为底部小字链接（RestoreLink），
 * 逻辑抽成 useRestorePurchases 供两种形态共享。
 */
export function useRestorePurchases() {
  const { restorePurchases, showToast, signedIn } = useApp();
  const { t } = useTranslation('membership');
  const [busy, setBusy] = useState(false);
  const onPress = () => {
    if (!signedIn) {
      showToast(t('signInToSubscribe'), 'info');
      return;
    }
    setBusy(true);
    void restorePurchases()
      .then((restored) => showToast(restored ? t('restoreDone') : t('restoreNone'), 'info'))
      .finally(() => setBusy(false));
  };
  return { busy, onPress };
}

export function RestoreLink() {
  const { t } = useTranslation('membership');
  const { busy, onPress } = useRestorePurchases();
  const localStyles = useThemeStyles(makeStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('linkRestore')}
      disabled={busy}
      onPress={onPress}
      hitSlop={space.x2}
    >
      <Text style={localStyles.link}>{busy ? t('confirming') : t('linkRestore')}</Text>
    </Pressable>
  );
}

const makeStyles = (p: ThemeColors) => StyleSheet.create({
  link: {
    ...type.caption,
    color: p.textMuted,
  },
});
