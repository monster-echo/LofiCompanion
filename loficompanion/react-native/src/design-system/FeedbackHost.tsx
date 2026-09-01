import React, { useEffect, useRef } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { useApp } from '../state/AppStore';
import { usePreferences } from '../preferences/PreferencesProvider';
import { radii, spacing, ThemeColors } from '../theme/tokens';
import { useThemeStyles } from '../theme/useThemeStyles';
import { styles } from '../theme/styles';
import { AppIcon } from './AppIcon';
import { AppButton } from './components';
import { AppToastHost, TOAST_DURATION_MS } from './AppToast';
import { useTranslation } from 'react-i18next';

/**
 * 全局反馈宿主：Toast 交给 react-native-toast-message 顶部展示（AppToast），
 * 危险操作二次确认弹窗仍在此渲染。showToast 的调用方 API 不变。
 */
export function FeedbackHost() {
  const { toast, confirm, closeConfirm } = useApp();
  const { t } = useTranslation('common');
  const { palette } = usePreferences();
  const feedbackStyles = useThemeStyles(makeFeedbackStyles);
  // toast 状态变化 → 命令式触发顶部 toast；id 去重避免同一提示重复弹出
  const shownIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (!toast || shownIdRef.current === toast.id) return;
    shownIdRef.current = toast.id;
    Toast.show({
      type: toast.tone,
      text1: toast.message,
      visibilityTime: TOAST_DURATION_MS,
      onPress: () => Toast.hide(),
    });
  }, [toast]);
  return (
    <>
      <AppToastHost />
      <Modal visible={Boolean(confirm)} transparent animationType="fade">
        <Pressable style={feedbackStyles.scrim} onPress={closeConfirm}>
          <Pressable
            style={[feedbackStyles.dialog, { backgroundColor: palette.surface }]}
            onPress={() => undefined}
          >
            <View style={[feedbackStyles.alertIcon, { backgroundColor: palette.brandSoft }]}>
              <AppIcon name="alert" color={palette.warning} size={28} />
            </View>
            <Text style={styles.heading}>{confirm?.title}</Text>
            <Text style={[styles.secondary, feedbackStyles.center]}>{confirm?.message}</Text>
            <View style={feedbackStyles.actions}>
              <View style={feedbackStyles.action}>
                <AppButton label="取消" variant="secondary" onPress={closeConfirm} />
              </View>
              <View style={feedbackStyles.action}>
                <AppButton
                  label={confirm?.confirmLabel ?? t('confirm')}
                  variant="danger"
                  onPress={() => {
                    confirm?.onConfirm();
                    closeConfirm();
                  }}
                />
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const makeFeedbackStyles = (p: ThemeColors) => StyleSheet.create({
  scrim: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: p.scrim,
    padding: spacing.x6,
  },
  dialog: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    gap: spacing.x3,
    padding: spacing.x5,
    borderRadius: radii.sheet,
    backgroundColor: p.surface,
  },
  alertIcon: {
    width: 52,
    height: 52,
    borderRadius: radii.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: p.brandSoft,
  },
  center: { textAlign: 'center' },
  actions: { width: '100%', flexDirection: 'row', gap: spacing.x3 },
  action: { flex: 1 },
});
