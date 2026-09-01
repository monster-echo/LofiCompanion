import React, { useState } from 'react';
import { ListRow } from '../design-system/components';
import { useApp } from '../state/AppStore';
import { useTranslation } from 'react-i18next';

/**
 * 恢复购买（App Store 审核要求项）：商店已购 → 服务端按票据重验 →
 * 权益合并。无已购时静默提示，不报错误。
 */
export function RestoreRow() {
  const { restorePurchases, showToast, signedIn } = useApp();
  const { t } = useTranslation('membership');
  const [busy, setBusy] = useState(false);
  return (
    <ListRow
      label={busy ? t('confirming') : t('restorePurchases')}
      icon="clock"
      onPress={() => {
        if (!signedIn) {
          showToast(t('signInToSubscribe'), 'info');
          return;
        }
        setBusy(true);
        void restorePurchases()
          .then((restored) => showToast(restored ? t('restoreDone') : t('restoreNone'), 'info'))
          .finally(() => setBusy(false));
      }}
    />
  );
}
