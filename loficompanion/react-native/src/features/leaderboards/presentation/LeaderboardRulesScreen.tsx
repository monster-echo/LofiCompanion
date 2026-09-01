import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { apiClient } from '../../../data/apiClient';
import type { LeaderboardPrivacyRemote, LeaderboardViewRemote } from '../../../data/apiClient';
import { AppIcon, type IconName } from '../../../design-system/AppIcon';
import { useApp } from '../../../state/AppStore';
import { usePreferences } from '../../../preferences/PreferencesProvider';
import { useThemeStyles } from '../../../theme/useThemeStyles';
import { radii, space, type, type ThemeColors } from '../../../theme/tokens';
import { useAsyncRefresh } from '../application/useAsyncRefresh';
import { useTranslation } from 'react-i18next';
import { i18n } from '../../../i18n/core';

/**
 * S12 排行规则与隐私（doc-08 §13）：顶部当前名次卡（P0 只显示当前名次与分钟，
 * 变化不实现）；三条规则行 44dp + SVG 图标；「公开昵称」「参与排行榜」系统
 * 可访问 Switch（退出走 Confirm 二次确认，明确后果）；规则说明正文可展开。
 */
export function LeaderboardRulesScreen() {
  const { t } = useTranslation('leaderboards');
  const { user, back, showToast, showConfirm } = useApp();
  const { palette } = usePreferences();
  const styles = useThemeStyles(makeStyles);
  const privacy = useAsyncRefresh(() => apiClient.getLeaderboardPrivacy(), []);
  const board = useAsyncRefresh(() => apiClient.friendsLeaderboard(), []);

  // 服务端设置加载后的本地回显；保存乐观更新、失败回滚
  const [settings, setSettings] = useState<LeaderboardPrivacyRemote | null>(null);
  useEffect(() => {
    if (privacy.state.status === 'ready') setSettings(privacy.state.data);
  }, [privacy.state]);

  const boardView: LeaderboardViewRemote | null =
    board.state.status === 'ready' ? board.state.data : null;
  // 本人行永在（服务端 finalizeView 保证）；退出榜单时带 youOptedOut
  const selfEntry = boardView?.rankings.find((entry) => entry.userId === user?.id) ?? null;

  const [rulesOpen, setRulesOpen] = useState(false);

  const apply = async (patch: { publicDisplay?: boolean; optedOut?: boolean }) => {
    if (!settings) return;
    const previous = settings;
    setSettings({ ...settings, ...patch });
    try {
      const saved = await apiClient.updateLeaderboardPrivacy(patch);
      setSettings(saved);
      showToast(patch.optedOut === true ? t('youOptedOutHint') : t('savedToast'), 'success');
      void board.reload();
    } catch (error) {
      setSettings(previous); // 回滚
      showToast(error instanceof Error ? error.message : i18n.t('errors:saveFailed'), 'error');
    }
  };

  const onJoinLeaderboardChange = (next: boolean) => {
    if (!next) {
      // 退出榜单有明确后果 → Confirm 二次确认（doc-08 §21）
      showConfirm({
        title: t('optOutConfirmTitle'),
        message: t('optOutConfirmMessage'),
        confirmLabel: t('optOutConfirmLabel'),
        onConfirm: () => void apply({ optedOut: true }),
      });
      return;
    }
    void apply({ optedOut: false });
  };

  const rules: readonly { icon: IconName; text: string }[] = [
    { icon: 'check-circle', text: t('ruleCompletedOnly') },
    { icon: 'clock', text: t('ruleDailyCap') },
    { icon: 'stop', text: t('ruleNoAbandon') },
  ];

  const optedOut = settings?.optedOut ?? false;
  const publicDisplay = settings?.publicDisplay ?? true;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('backLabel')}
          onPress={back}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <AppIcon name="arrow-left" color={palette.textPrimary} size={22} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('rulesTitle')}</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* 当前名次卡：P0 只显示当前名次与分钟（变化不实现） */}
        <View style={styles.rankCard}>
          {privacy.state.status === 'loading' || board.state.status === 'loading' ? (
            <Text style={styles.cardCaption}>正在加载…</Text>
          ) : privacy.state.status === 'error' || board.state.status === 'error' ? (
            <>
              <Text style={styles.cardCaption}>
                {privacy.state.status === 'error'
                  ? privacy.state.message
                  : board.state.status === 'error'
                    ? board.state.message
                    : ''}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('retryAction')}
                onPress={() => {
                  privacy.reload();
                  board.reload();
                }}
                style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
              >
                <Text style={styles.retryText}>{t('retryAction')}</Text>
              </Pressable>
            </>
          ) : optedOut ? (
            <Text style={styles.rankHidden}>{t('rankHiddenWhenOptedOut')}</Text>
          ) : (
            <>
              <Text style={styles.rankLabel}>{t('currentRankCard')}</Text>
              <Text style={styles.rankValue}>
                {t('currentRankValue', { rank: selfEntry?.rank ?? 0 })}
              </Text>
              <Text style={styles.rankMinutes}>
                {t('currentRankMinutes', { minutes: selfEntry?.minutes ?? 0 })}
              </Text>
            </>
          )}
        </View>

        {/* 三条规则行 44dp + SVG 图标（doc-08 §13） */}
        <View style={styles.rulesCard}>
          {rules.map((rule) => (
            <View key={rule.text} style={styles.ruleRow}>
              <AppIcon name={rule.icon} color={palette.textSecondary} size={20} />
              <Text style={styles.ruleText}>{rule.text}</Text>
            </View>
          ))}
        </View>

        {/* 隐私开关：系统可访问 Switch，不藏在二级设置（doc-08 §13） */}
        <View style={styles.privacyCard}>
          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.switchLabel}>{t('publicNickname')}</Text>
              <Text style={styles.switchHint}>{t('publicNicknameHint')}</Text>
            </View>
            <Switch
              value={publicDisplay && !optedOut}
              disabled={!settings || optedOut}
              onValueChange={(next) => void apply({ publicDisplay: next })}
            />
          </View>
          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.switchLabel}>{t('joinLeaderboard')}</Text>
              <Text style={styles.switchHint}>{t('joinLeaderboardHint')}</Text>
            </View>
            <Switch
              value={settings ? !optedOut : false}
              disabled={!settings}
              onValueChange={onJoinLeaderboardChange}
            />
          </View>
        </View>

        {/* 规则说明正文可展开（静态文案） */}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: rulesOpen }}
          accessibilityLabel={t('rulesBodyTitle')}
          onPress={() => setRulesOpen((open) => !open)}
          style={({ pressed }) => [styles.bodyToggle, pressed && styles.pressed]}
        >
          <Text style={styles.bodyToggleText}>{t('rulesBodyTitle')}</Text>
          <View style={rulesOpen ? styles.chevronOpen : undefined}>
            <AppIcon name="chevron-down" color={palette.textMuted} size={18} />
          </View>
        </Pressable>
        {rulesOpen ? (
          <View style={styles.rulesBodyCard}>
            <Text style={styles.rulesBodyText}>{t('rulesBody')}</Text>
          </View>
        ) : null}
      </ScrollView>
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.x2,
    gap: space.x1,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: radii.round,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...type.title2,
    color: p.textPrimary,
    flex: 1,
    textAlign: 'center',
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingTop: space.x3,
    paddingHorizontal: space.x4,
    paddingBottom: space.x8,
    gap: space.x4,
  },
  rankCard: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: p.borderSoft,
    backgroundColor: p.surface,
    alignItems: 'center',
    padding: space.x5,
    gap: space.x1,
  },
  rankLabel: {
    ...type.label,
    color: p.textSecondary,
  },
  rankValue: {
    ...type.displayMetric,
    color: p.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  rankMinutes: {
    ...type.caption,
    color: p.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  rankHidden: {
    ...type.body,
    color: p.textSecondary,
    textAlign: 'center',
  },
  cardCaption: {
    ...type.caption,
    color: p.textMuted,
    textAlign: 'center',
  },
  rulesCard: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: p.borderSoft,
    backgroundColor: p.surface,
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
  privacyCard: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: p.borderSoft,
    backgroundColor: p.surface,
    paddingHorizontal: space.x4,
    paddingVertical: space.x2,
    gap: space.x2,
  },
  switchRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x3,
    paddingVertical: space.x2,
  },
  switchText: {
    flex: 1,
    gap: 2,
  },
  switchLabel: {
    ...type.bodyStrong,
    color: p.textPrimary,
  },
  switchHint: {
    ...type.caption,
    color: p.textMuted,
  },
  bodyToggle: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.x2,
  },
  bodyToggleText: {
    ...type.bodyStrong,
    color: p.textSecondary,
  },
  chevronOpen: {
    transform: [{ rotate: '180deg' }],
  },
  rulesBodyCard: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: p.borderSoft,
    backgroundColor: p.surface,
    padding: space.x4,
  },
  rulesBodyText: {
    ...type.body,
    color: p.textSecondary,
    lineHeight: 22,
  },
  retryButton: {
    minHeight: 44,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: p.borderStandard,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.x6,
    marginTop: space.x2,
  },
  retryText: {
    ...type.bodyStrong,
    color: p.textSecondary,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
});
