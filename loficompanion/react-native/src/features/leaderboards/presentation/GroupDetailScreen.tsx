import React from 'react';
import { Image, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { apiClient } from '../../../data/apiClient';
import type { RootParamList } from '../../../navigation/navigationRef';
import { AppIcon } from '../../../design-system/AppIcon';
import { mediaControl } from '../../../design-system/derivedTokens';
import { useApp } from '../../../state/AppStore';
import { usePreferences } from '../../../preferences/PreferencesProvider';
import { useThemeStyles } from '../../../theme/useThemeStyles';
import { radii, space, type, type ThemeColors } from '../../../theme/tokens';
import { useFocus } from '../../focus/application/FocusStore';
import { ImmersiveMediaSurface } from '../../skins/presentation/ImmersiveMediaSurface';
import { useAsyncRefresh } from '../application/useAsyncRefresh';
import { avatarInitial, goalProgress, weekIdOf, previousWeekStartMs } from '../domain/model';
import { useTranslation } from 'react-i18next';

/**
 * S11 雨夜自习室 / 小组详情（doc-08 §12）：房间氛围媒体占上半屏（顶部渐暗、
 * 透明 App bar 叠加组名）；成员头像 44 最多 6 个 +「+N」+ 绿点在线专注人数
 * （只表示在线，无任务正文）；共同目标卡（24 内边距）+ 我的贡献卡（16 内边距）；
 * 主按钮「开始一起学习」→ focus.setup；owner 展示加入码；上周结算已生成时
 * 提供「查看上周结算」入口（weekly.settlement）。
 */

const MAX_AVATARS = 6;

export function GroupDetailScreen() {
  const { t } = useTranslation('leaderboards');
  const { params } = useRoute<RouteProp<RootParamList, 'groups.detail'>>();
  const groupId = params?.groupId ?? '';
  const { user, navigate, back } = useApp();
  const focus = useFocus();
  const { palette } = usePreferences();
  const styles = useThemeStyles(makeStyles);

  const loaded = useAsyncRefresh(async () => {
    const [detail, board, previous] = await Promise.all([
      apiClient.getGroupDetail(groupId),
      apiClient.groupLeaderboard(groupId),
      // 上周视图：快照已惰性结算（isWeekOver && snapshotUsed）才显示 S13 入口
      apiClient.groupLeaderboard(groupId, weekIdOf(previousWeekStartMs(Date.now()))),
    ]);
    return { detail, board, previous };
  }, [groupId]);

  if (!groupId) {
    return <MissingGroup onBack={back} />;
  }

  if (loaded.state.status === 'loading') {
    return <StateShell onBack={back} title=""><Text style={styles.stateText}>正在加载…</Text></StateShell>;
  }
  if (loaded.state.status === 'error') {
    return (
      <StateShell onBack={back} title="">
        <Text style={styles.stateTitle}>{loaded.state.message}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('retryAction')}
          onPress={loaded.reload}
          style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
        >
          <Text style={styles.retryText}>{t('retryAction')}</Text>
        </Pressable>
      </StateShell>
    );
  }

  const { detail, board, previous } = loaded.state.data;
  const isOwner = detail.group.ownerUserId === user?.id;
  const me = board.rankings.find((entry) => entry.userId === user?.id) ?? null;
  const shownMembers = detail.members.slice(0, MAX_AVATARS);
  const overflow = detail.members.length - shownMembers.length;
  const ratio = goalProgress(detail.thisWeekMinutes, detail.group.weeklyGoalMinutes);
  const lastWeekSettled = previous.isWeekOver && previous.snapshotUsed;

  const shareJoinCode = () => {
    void Share.share({
      message: `${t('joinCodeCard')}（${detail.group.name}）：${detail.group.joinCode}`,
    });
  };

  return (
    <View style={styles.screen}>
      {/* 房间氛围媒体（ImmersiveMediaSurface ready 态自带顶部渐暗叠层） */}
      <View style={styles.media}>
        <ImmersiveMediaSurface
          manifest={focus.skin}
          state="ready"
          reducedMotion={focus.reducedMotion}
          style={StyleSheet.absoluteFill}
        />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* 在线专注（只表示在线，无任务正文）+ 成员头像 ≤6 +「+N」 */}
        <View style={styles.membersBlock} pointerEvents="none">
          <View style={styles.onlineRow}>
            {detail.onlineCount > 0 ? <View style={styles.onlineDot} /> : null}
            <Text style={styles.onlineText}>
              {detail.onlineCount > 0 ? t('onlineFocusing', { count: detail.onlineCount }) : t('onlineNone')}
            </Text>
          </View>
          <View style={styles.avatarsRow}>
            {shownMembers.map((member) => (
              <View key={member.userId} style={styles.memberItem}>
                {member.avatarUrl ? (
                  <Image source={{ uri: member.avatarUrl }} style={styles.memberAvatar} />
                ) : (
                  <View style={[styles.memberAvatar, styles.avatarFallback]}>
                    <Text style={styles.avatarInitial}>{avatarInitial(member.nickname)}</Text>
                  </View>
                )}
                {member.role === 'owner' ? (
                  <View style={styles.ownerCrown} pointerEvents="none">
                    <AppIcon name="crown" color={palette.achievement} size={12} />
                  </View>
                ) : null}
              </View>
            ))}
            {overflow > 0 ? (
              <View style={[styles.memberAvatar, styles.overflowChip]}>
                <Text style={styles.overflowText}>{t('moreMembers', { count: overflow })}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* 共同目标卡（24 内边距）：本周共同 X / 目标 Y + 6dp 进度条 */}
        <View style={styles.goalCard}>
          <Text style={styles.goalLabel}>{t('sharedGoalCard')}</Text>
          <Text style={styles.goalValue}>{t('sharedGoalValue', { minutes: detail.thisWeekMinutes })}</Text>
          <Text style={styles.goalTarget}>{t('sharedGoalTarget', { goal: detail.group.weeklyGoalMinutes })}</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(ratio * 100)}%` }]} />
          </View>
        </View>

        {/* 我的贡献卡（16 内边距） */}
        <View style={styles.contributionCard}>
          <Text style={styles.contributionLabel}>{t('myContributionCard')}</Text>
          <Text style={styles.contributionValue}>
            {t('myContributionValue', { minutes: me?.minutes ?? 0 })}
            {me ? ` · ${t('myContributionRank', { rank: me.rank })}` : ''}
          </Text>
        </View>

        {/* owner 展示加入码 + 复制 */}
        {isOwner ? (
          <View style={styles.joinCodeCard}>
            <View style={styles.joinCodeHead}>
              <Text style={styles.contributionLabel}>{t('joinCodeCard')}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('copyJoinCode')}
                onPress={shareJoinCode}
                style={({ pressed }) => [styles.copyButton, pressed && styles.pressed]}
              >
                <Text style={styles.copyText}>{t('copyJoinCode')}</Text>
              </Pressable>
            </View>
            <Text selectable style={styles.joinCode}>{detail.group.joinCode}</Text>
            <Text style={styles.joinCodeHint}>{t('joinCodeHint')}</Text>
          </View>
        ) : null}

        {/* 上周结算入口（快照已生成才显示） */}
        {lastWeekSettled ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('lastWeekSettlement')}
            onPress={() => navigate('weekly.settlement', { groupId })}
            style={({ pressed }) => [styles.settlementRow, pressed && styles.pressed]}
          >
            <AppIcon name="image" color={palette.achievement} size={20} />
            <Text style={styles.settlementText}>{t('lastWeekSettlement')}</Text>
            <AppIcon name="chevron-right" color={palette.textMuted} size={18} />
          </Pressable>
        ) : null}
      </ScrollView>

      {/* 透明 App bar（叠加于媒体之上）：返回 + 组名 */}
      <View style={styles.appBar} pointerEvents="box-none">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('backLabel')}
          onPress={back}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <AppIcon name="arrow-left" color={palette.textPrimary} size={22} />
        </Pressable>
        <Text style={styles.appBarTitle} numberOfLines={1}>{detail.group.name}</Text>
        <View style={styles.backButton} />
      </View>

      {/* 主按钮固定底部 */}
      <View style={styles.ctaBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('startTogether')}
          onPress={() => navigate('focus.setup')}
          style={({ pressed }) => [styles.primaryCta, pressed && styles.pressed]}
        >
          <Text style={styles.primaryCtaText}>{t('startTogether')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function MissingGroup({ onBack }: Readonly<{ onBack: () => void }>) {
  const { t } = useTranslation('leaderboards');
  const styles = useThemeStyles(makeStyles);
  return (
    <StateShell onBack={onBack} title="">
      <Text style={styles.stateText}>{t('groupUnavailable')}</Text>
    </StateShell>
  );
}

function StateShell({ onBack, title, children }: Readonly<{
  onBack: () => void;
  title: string;
  children: React.ReactNode;
}>) {
  const { t } = useTranslation('leaderboards');
  const { palette } = usePreferences();
  const styles = useThemeStyles(makeStyles);
  return (
    <View style={styles.screen}>
      <View style={styles.appBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('backLabel')}
          onPress={onBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <AppIcon name="arrow-left" color={palette.textPrimary} size={22} />
        </Pressable>
        <Text style={styles.appBarTitle}>{title}</Text>
        <View style={styles.backButton} />
      </View>
      <View style={styles.stateWrap}>{children}</View>
    </View>
  );
}

const makeStyles = (p: ThemeColors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: p.canvasDeep,
  },
  media: {
    height: '44%',
  },
  scroll: {
    flex: 1,
    marginTop: -space.x6, // 内容轻叠媒体下缘（房间氛围延伸感）
  },
  scrollContent: {
    paddingHorizontal: space.x4,
    paddingBottom: 120, // 底部主 CTA 不遮内容
    gap: space.x4,
  },
  appBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
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
    backgroundColor: mediaControl,
  },
  appBarTitle: {
    ...type.title3,
    color: p.textPrimary,
    flex: 1,
    textAlign: 'center',
  },
  membersBlock: {
    alignItems: 'center',
    gap: space.x3,
    paddingTop: space.x5,
  },
  onlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x2,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: radii.round,
    backgroundColor: p.success,
  },
  onlineText: {
    ...type.caption,
    color: p.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  avatarsRow: {
    flexDirection: 'row',
    gap: space.x2,
  },
  memberItem: {
    width: 44,
    height: 44,
  },
  memberAvatar: {
    width: 44,
    height: 44,
    borderRadius: radii.round,
  },
  ownerCrown: {
    position: 'absolute',
    right: -2,
    top: -4,
  },
  avatarFallback: {
    backgroundColor: p.surfaceRaised,
    borderWidth: 1,
    borderColor: p.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    ...type.bodyStrong,
    color: p.textSecondary,
  },
  overflowChip: {
    backgroundColor: mediaControl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overflowText: {
    ...type.label,
    color: p.textPrimary,
  },
  goalCard: {
    backgroundColor: mediaControl,
    borderWidth: 1,
    borderColor: p.borderSoft,
    borderRadius: radii.card,
    padding: space.x6, // 共同目标卡 24 内边距（doc-08 §12）
    gap: space.x2,
  },
  goalLabel: {
    ...type.label,
    color: p.textSecondary,
  },
  goalValue: {
    ...type.title2,
    color: p.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  goalTarget: {
    ...type.caption,
    color: p.textMuted,
    fontVariant: ['tabular-nums'],
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: p.surfaceInset,
    overflow: 'hidden',
    marginTop: space.x1,
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: p.actionPrimary,
  },
  contributionCard: {
    backgroundColor: mediaControl,
    borderWidth: 1,
    borderColor: p.borderSoft,
    borderRadius: radii.card,
    padding: space.x4, // 我的贡献卡 16 内边距（doc-08 §12）
    gap: space.x1,
  },
  contributionLabel: {
    ...type.label,
    color: p.textSecondary,
  },
  contributionValue: {
    ...type.bodyStrong,
    color: p.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  joinCodeCard: {
    backgroundColor: mediaControl,
    borderWidth: 1,
    borderColor: p.borderSoft,
    borderRadius: radii.card,
    padding: space.x4,
    gap: space.x2,
  },
  joinCodeHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  copyButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: space.x2,
  },
  copyText: {
    ...type.label,
    color: p.actionPrimary,
  },
  joinCode: {
    ...type.title1,
    color: p.textPrimary,
    fontVariant: ['tabular-nums'],
    letterSpacing: 4,
    textAlign: 'center',
  },
  joinCodeHint: {
    ...type.caption,
    color: p.textMuted,
    textAlign: 'center',
  },
  settlementRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x3,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: p.borderStandard,
    backgroundColor: p.surface,
    paddingHorizontal: space.x4,
  },
  settlementText: {
    ...type.bodyStrong,
    color: p.textPrimary,
    flex: 1,
  },
  ctaBar: {
    position: 'absolute',
    left: space.x4,
    right: space.x4,
    bottom: space.x5,
  },
  primaryCta: {
    minHeight: 52,
    borderRadius: radii.control,
    backgroundColor: p.actionPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryCtaText: {
    ...type.bodyStrong,
    color: p.canvasDeep,
  },
  stateWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.x8,
    gap: space.x3,
  },
  stateTitle: {
    ...type.title3,
    color: p.textPrimary,
    textAlign: 'center',
  },
  stateText: {
    ...type.caption,
    color: p.textMuted,
    textAlign: 'center',
  },
  retryButton: {
    minHeight: 48,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: p.borderStandard,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.x6,
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
