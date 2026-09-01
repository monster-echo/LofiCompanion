import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon, IconName } from '../../../design-system/AppIcon';
import { useApp } from '../../../state/AppStore';
import { usePreferences } from '../../../preferences/PreferencesProvider';
import { useThemeStyles } from '../../../theme/useThemeStyles';
import { radii, space, type, type ThemeColors } from '../../../theme/tokens';
import { useTranslation } from 'react-i18next';

/**
 * S10 学习排行榜（doc-08 §11，P0-A 仅登录引导壳）。Tab 根页：居中群体图标
 * + 登录邀请 + 三条计分规则（44dp 行），主 CTA → auth.signIn。
 * 榜单/好友/小组数据与周结算属 P0-B，不伪造任何榜单内容。
 */
export function LeaderboardSignInScreen() {
  const { t } = useTranslation('leaderboards');
  const { navigate } = useApp();
  const { palette } = usePreferences();
  const styles = useThemeStyles(makeStyles);

  const rules: readonly { icon: IconName; text: string }[] = [
    { icon: 'check-circle', text: t('ruleCompletedOnly') },
    { icon: 'clock', text: t('ruleDailyCap') },
    { icon: 'stop', text: t('ruleNoAbandon') },
  ];

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('screenTitle')}</Text>
      </View>

      <View style={styles.body}>
        <View style={styles.heroIcon}>
          <AppIcon name="group" color={palette.actionPrimary} size={32} />
        </View>
        <Text style={styles.heroTitle}>{t('signInInvite')}</Text>

        <View style={styles.rules}>
          {rules.map((rule) => (
            <View key={rule.text} style={styles.ruleRow}>
              <AppIcon name={rule.icon} color={palette.textSecondary} size={20} />
              <Text style={styles.ruleText}>{rule.text}</Text>
            </View>
          ))}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('signInAction')}
          onPress={() => navigate('auth.signIn')}
          style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
        >
          <Text style={styles.ctaText}>{t('signInAction')}</Text>
        </Pressable>
        <Text style={styles.upcoming}>{t('p0bNote')}</Text>
      </View>

    </View>
  );
}

const makeStyles = (p: ThemeColors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: p.canvas,
  },
  header: {
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...type.title2,
    color: p.textPrimary,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.x4,
    gap: space.x5,
  },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: radii.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: p.brandSoft,
  },
  heroTitle: {
    ...type.title3,
    color: p.textPrimary,
    textAlign: 'center',
  },
  rules: {
    alignSelf: 'stretch',
    borderRadius: radii.card,
    backgroundColor: p.surface,
    borderWidth: 1,
    borderColor: p.borderSoft,
    paddingHorizontal: space.x4,
    paddingVertical: space.x2,
  },
  ruleRow: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x3,
  },
  ruleText: {
    ...type.body,
    color: p.textSecondary,
    flex: 1,
  },
  cta: {
    alignSelf: 'stretch',
    minHeight: 52,
    borderRadius: radii.control,
    backgroundColor: p.actionPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    ...type.bodyStrong,
    color: p.canvasDeep,
  },
  upcoming: {
    ...type.caption,
    color: p.textMuted,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
});
