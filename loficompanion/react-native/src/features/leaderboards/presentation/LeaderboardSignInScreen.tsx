import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon, IconName } from '../../../design-system/AppIcon';
import { useApp } from '../../../state/AppStore';
import { colors, radii, semantic, space, type } from '../../../theme/tokens';
import { LEADERBOARD_STRINGS as STR } from './strings';

/**
 * S10 学习排行榜（doc-08 §11，P0-A 仅登录引导壳）。Tab 根页：居中群体图标
 * + 登录邀请 + 三条计分规则（44dp 行），主 CTA → auth.signIn。
 * 榜单/好友/小组数据与周结算属 P0-B，不伪造任何榜单内容。
 */
export function LeaderboardSignInScreen() {
  const { navigate } = useApp();

  const rules: readonly { icon: IconName; text: string }[] = [
    { icon: 'check-circle', text: STR.ruleCompletedOnly },
    { icon: 'clock', text: STR.ruleDailyCap },
    { icon: 'stop', text: STR.ruleNoAbandon },
  ];

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{STR.screenTitle}</Text>
      </View>

      <View style={styles.body}>
        <View style={styles.heroIcon}>
          <AppIcon name="group" color={semantic.actionPrimary} size={32} />
        </View>
        <Text style={styles.heroTitle}>{STR.signInInvite}</Text>

        <View style={styles.rules}>
          {rules.map((rule) => (
            <View key={rule.text} style={styles.ruleRow}>
              <AppIcon name={rule.icon} color={semantic.textSecondary} size={20} />
              <Text style={styles.ruleText}>{rule.text}</Text>
            </View>
          ))}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={STR.signInAction}
          onPress={() => navigate('auth.signIn')}
          style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
        >
          <Text style={styles.ctaText}>{STR.signInAction}</Text>
        </Pressable>
        <Text style={styles.upcoming}>{STR.p0bNote}</Text>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semantic.canvas,
  },
  header: {
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...type.title2,
    color: semantic.textPrimary,
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
    backgroundColor: colors.brandSoft,
  },
  heroTitle: {
    ...type.title3,
    color: semantic.textPrimary,
    textAlign: 'center',
  },
  rules: {
    alignSelf: 'stretch',
    borderRadius: radii.card,
    backgroundColor: semantic.surface,
    borderWidth: 1,
    borderColor: semantic.borderSoft,
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
    color: semantic.textSecondary,
    flex: 1,
  },
  cta: {
    alignSelf: 'stretch',
    minHeight: 52,
    borderRadius: radii.control,
    backgroundColor: semantic.actionPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    ...type.bodyStrong,
    color: semantic.canvasDeep,
  },
  upcoming: {
    ...type.caption,
    color: semantic.textMuted,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
});
