import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { apiClient } from '../../../data/apiClient';
import type { RootParamList } from '../../../navigation/navigationRef';
import { AppIcon } from '../../../design-system/AppIcon';
import { achievementSoft, mediaControl } from '../../../design-system/derivedTokens';
import { useApp } from '../../../state/AppStore';
import { radii, semantic, space, type } from '../../../theme/tokens';
import { useFocus } from '../../focus/application/FocusStore';
import { ImmersiveMediaSurface } from '../../skins/presentation/ImmersiveMediaSurface';
import { useAsyncRefresh } from '../application/useAsyncRefresh';
import { previousWeekStartMs, weekIdOf } from '../domain/model';
import { LEADERBOARD_STRINGS as STR } from './strings';

/**
 * S13 周结算（doc-08 §14）：完成房间媒体占顶部 58%（completed 态）；结果
 * sheet（与 S06 结果板同构）显示名次 / 共同分钟 / 目标是否达成，达成时给
 * 「周目标合影」收藏物行（amber group 图标）；主按钮「查看房间」、次按钮
 * 「下周继续」。名次只陈述结果，不使用羞耻文案（doc-08 §22）。
 */
export function WeeklySettlementScreen() {
  const { params } = useRoute<RouteProp<RootParamList, 'weekly.settlement'>>();
  const groupId = params?.groupId ?? '';
  const { user, navigate, back } = useApp();
  const focus = useFocus();

  // 周结算查上一周：周末后首次查询惰性生成不可变快照（服务端保证幂等）
  const weekId = weekIdOf(previousWeekStartMs(Date.now()));
  const loaded = useAsyncRefresh(async () => {
    if (!groupId) throw new Error(STR.groupUnavailable);
    return await apiClient.groupLeaderboard(groupId, weekId);
  }, [groupId, weekId]);

  const view = loaded.state.status === 'ready' ? loaded.state.data : null;
  const settled = view !== null && view.isWeekOver && view.snapshotUsed;
  const me = view?.rankings.find((entry) => entry.userId === user?.id) ?? null;
  const totalMinutes = view ? Math.floor(view.groupTotalSeconds / 60) : 0;
  const remainMinutes = view
    ? Math.max(0, view.weeklyGoalMinutes - totalMinutes)
    : 0;

  return (
    <View style={styles.screen}>
      {/* 完成房间媒体：顶部 58%（doc-08 §14） */}
      <View style={styles.media}>
        <ImmersiveMediaSurface
          manifest={focus.skin}
          state="completed"
          reducedMotion={focus.reducedMotion}
          style={StyleSheet.absoluteFill}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={STR.backLabel}
          onPress={back}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <AppIcon name="arrow-left" color={semantic.textPrimary} size={22} />
        </Pressable>
      </View>

      {/* 结果 sheet（S06 结果板同构：媒体表面色、圆角 24、CTA 固定） */}
      <View style={styles.sheet}>
        {loaded.state.status === 'loading' ? (
          <Text style={styles.pendingText}>正在加载…</Text>
        ) : loaded.state.status === 'error' ? (
          <>
            <Text style={styles.pendingText}>{loaded.state.message}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={STR.retryAction}
              onPress={loaded.reload}
              style={({ pressed }) => [styles.secondaryCta, pressed && styles.pressed]}
            >
              <Text style={styles.secondaryCtaText}>{STR.retryAction}</Text>
            </Pressable>
          </>
        ) : !settled ? (
          <Text style={styles.pendingText}>{STR.settlementPending}</Text>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetContent}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>{STR.settlementTitle}</Text>
              <Text style={styles.sheetWeek}>{weekId}</Text>
            </View>

            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>{STR.settlementRankLabel}</Text>
              <Text style={styles.resultValue}>
                {STR.settlementRankValue(me?.rank ?? view?.rankings.length ?? 0)}
              </Text>
            </View>
            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>{STR.settlementTogether}</Text>
              <Text style={styles.resultValue}>
                {STR.settlementTogetherValue(totalMinutes)}
              </Text>
            </View>
            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>
                {view ? STR.settlementGoal(view.weeklyGoalMinutes) : ''}
              </Text>
              <Text
                style={[
                  styles.resultValue,
                  { color: view?.goalMet ? semantic.success : semantic.textPrimary },
                ]}
              >
                {view?.goalMet ? STR.settlementGoalMet : STR.settlementGoalRemain(remainMinutes)}
              </Text>
            </View>

            {view?.goalMet ? (
              <View style={styles.rewardRow}>
                <AppIcon name="group" color={semantic.achievement} size={20} />
                <Text style={styles.rewardText} numberOfLines={1}>{STR.settlementReward}</Text>
              </View>
            ) : null}
          </ScrollView>
        )}

        {/* CTA 固定：主「查看房间」→ room.home；次「下周继续」→ back */}
        <View style={styles.ctaArea}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={STR.settlementViewRoom}
            onPress={() => navigate('room.home')}
            style={({ pressed }) => [styles.primaryCta, pressed && styles.pressed]}
          >
            <Text style={styles.primaryCtaText}>{STR.settlementViewRoom}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={STR.settlementNextWeek}
            onPress={back}
            style={({ pressed }) => [styles.secondaryCta, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryCtaText}>{STR.settlementNextWeek}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semantic.canvasDeep,
  },
  media: {
    height: '58%',
  },
  backButton: {
    position: 'absolute',
    top: space.x2,
    left: space.x2,
    width: 44,
    height: 44,
    borderRadius: radii.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: mediaControl,
  },
  sheet: {
    flex: 1,
    marginTop: -radii.sheet, // sheet 圆角叠上媒体（S06 结果板同构）
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    borderColor: semantic.borderStandard,
    backgroundColor: semantic.canvas,
    paddingTop: space.x5,
    paddingHorizontal: space.x4,
    paddingBottom: space.x6,
  },
  sheetContent: {
    gap: space.x3,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: space.x1,
  },
  sheetTitle: {
    ...type.title2,
    color: semantic.textPrimary,
  },
  sheetWeek: {
    ...type.caption,
    color: semantic.textMuted,
    fontVariant: ['tabular-nums'],
  },
  resultRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.x3,
  },
  resultLabel: {
    ...type.body,
    color: semantic.textSecondary,
    flexShrink: 1,
  },
  resultValue: {
    ...type.bodyStrong,
    color: semantic.textPrimary,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  rewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x2,
    backgroundColor: achievementSoft,
    borderRadius: radii.small,
    paddingHorizontal: space.x3,
    paddingVertical: space.x2,
  },
  rewardText: {
    ...type.bodyStrong,
    color: semantic.textPrimary,
    flexShrink: 1,
  },
  pendingText: {
    ...type.body,
    color: semantic.textSecondary,
    textAlign: 'center',
    paddingVertical: space.x6,
  },
  ctaArea: {
    marginTop: space.x4,
    gap: space.x2,
  },
  primaryCta: {
    minHeight: 52,
    borderRadius: radii.control,
    backgroundColor: semantic.actionPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryCtaText: {
    ...type.bodyStrong,
    color: semantic.canvasDeep,
  },
  secondaryCta: {
    minHeight: 48,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: semantic.borderStandard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryCtaText: {
    ...type.bodyStrong,
    color: semantic.textSecondary,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
});
