import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../../../design-system/AppIcon';
import { WeeklyProgressCard } from '../../../design-system/WeeklyProgressCard';
import { useApp } from '../../../state/AppStore';
import { usePreferences } from '../../../preferences/PreferencesProvider';
import { useThemeStyles } from '../../../theme/useThemeStyles';
import { radii, space, type, type ThemeColors } from '../../../theme/tokens';
import { useFocus } from '../../focus/application/FocusStore';
import { useTranslation } from 'react-i18next';
import {
  completedEntries,
  entryMinutes,
  weekActivityMinutes,
  weekDayMinutes,
} from '../domain/insights';

/**
 * S08 学习记录（doc-08 §9）。Push 页：首卡本周专注 + 七日柱图（缺失日为 0），
 * 科目分布行 h36（标签 48 宽 + 弹性进度条 + 右对齐数值），时间线行高 ≥52。
 * 全部图表由真实组件渲染；P0-A 周期选择器为「本周」展示位（不可切换）。
 */
export function HistoryScreen() {
  const focus = useFocus();
  const { t } = useTranslation('achievements');
  const { t: tFocus } = useTranslation('focus');
  const { back, navigate } = useApp();
  const { palette } = usePreferences();
  const styles = useThemeStyles(makeStyles);

  const entries = completedEntries(focus.history);
  const empty = entries.length === 0;
  const days = weekDayMinutes(entries, Date.now());
  const slices = weekActivityMinutes(entries, Date.now());
  const peakMinutes = slices.length > 0 ? Math.max(...slices.map((s) => s.minutes)) : 0;

  if (empty) {
    return (
      <View style={styles.screen}>
        <Header onBack={back} />
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{t('historyEmpty')}</Text>
          <Text style={styles.emptyHint}>{t('historyEmptyHint')}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('startFirstRound')}
            onPress={() => navigate('home')}
            style={({ pressed }) => [styles.emptyCta, pressed && styles.pressed]}
          >
            <Text style={styles.emptyCtaText}>{t('startFirstRound')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Header onBack={back} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <WeeklyProgressCard
          weekMinutes={focus.week.minutes}
          targetMinutes={focus.week.targetMinutes}
          days={days}
        />

        {/* 科目分布：行高 36，标签 48 宽 + 弹性条 + 右对齐分钟 */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('activityBreakdown')}</Text>
          {slices.map((slice, index) => (
            <View key={slice.activity} style={styles.sliceRow}>
              <Text style={styles.sliceLabel} numberOfLines={1}>
                {tFocus(`activity.${slice.activity}`)}
              </Text>
              <View style={styles.sliceTrack}>
                <View
                  style={[
                    styles.sliceFill,
                    {
                      width: `${Math.max(4, Math.round((slice.minutes / peakMinutes) * 100))}%`,
                      backgroundColor:
                        index === 0 ? palette.actionPrimary : palette.borderStandard,
                    },
                  ]}
                />
              </View>
              <Text style={styles.sliceValue}>{t('minutesValue', { n: slice.minutes })}</Text>
            </View>
          ))}
        </View>

        {/* 学习记录时间线：行高 ≥52，日期 52 宽，任务名最多两行，分钟右对齐 */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('timelineTitle')}</Text>
          {entries.map((entry, index) => (
            <View
              key={entry.id}
              style={[styles.timelineRow, index > 0 && styles.timelineDivider]}
            >
              <Text style={styles.timelineDate}>{formatDay(entry.completedAtUtc)}</Text>
              <Text style={styles.timelineActivity} numberOfLines={2}>
                {tFocus(`activity.${entry.activity}`)}
              </Text>
              <Text style={styles.timelineMinutes}>{t('timelineMinutes', { n: entryMinutes(entry) })}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

/** App bar 56：左返回 44×44，标题居中，右 88×40 周期选择器（P0-A 展示位） */
function Header({ onBack }: Readonly<{ onBack: () => void }>) {
  const { t } = useTranslation('achievements');
  const { palette } = usePreferences();
  const styles = useThemeStyles(makeStyles);
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('backLabel')}
        onPress={onBack}
        style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
      >
        <AppIcon name="arrow-left" color={palette.textPrimary} size={22} />
      </Pressable>
      <Text style={styles.headerTitle}>{t('historyTitle')}</Text>
      <View style={styles.periodChip}>
        <Text style={styles.periodChipText}>{t('periodThisWeek')}</Text>
        <AppIcon name="chevron-down" color={palette.textMuted} size={16} />
      </View>
    </View>
  );
}

/** MM-DD（与统计同口径：Asia/Shanghai 本地日界，不依赖设备时区） */
function formatDay(epochMs: number): string {
  const shifted = new Date(epochMs + 8 * 3_600_000);
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  return `${month}-${day}`;
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
  periodChip: {
    width: 88,
    height: 40,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: p.borderStandard,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.x1,
  },
  periodChipText: {
    ...type.label,
    color: p.textSecondary,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingTop: space.x3,
    paddingHorizontal: space.x4,
    paddingBottom: space.x6,
    gap: space.x6,
  },
  card: {
    backgroundColor: p.surface,
    borderWidth: 1,
    borderColor: p.borderSoft,
    borderRadius: radii.card,
    padding: space.x4,
    gap: space.x2,
  },
  cardTitle: {
    ...type.title3,
    color: p.textPrimary,
    marginBottom: space.x1,
  },
  sliceRow: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x3,
  },
  sliceLabel: {
    ...type.label,
    color: p.textSecondary,
    width: 48,
  },
  sliceTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: p.surfaceInset,
    overflow: 'hidden',
  },
  sliceFill: {
    height: 6,
    borderRadius: 3,
  },
  sliceValue: {
    ...type.caption,
    color: p.textSecondary,
    minWidth: 44,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  timelineRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x3,
    paddingVertical: space.x2,
  },
  timelineDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: p.borderSoft,
  },
  timelineDate: {
    ...type.caption,
    color: p.textMuted,
    width: 52,
    fontVariant: ['tabular-nums'],
  },
  timelineActivity: {
    ...type.body,
    color: p.textPrimary,
    flex: 1,
  },
  timelineMinutes: {
    ...type.body,
    color: p.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.x8,
    gap: space.x3,
  },
  emptyTitle: {
    ...type.title3,
    color: p.textPrimary,
  },
  emptyHint: {
    ...type.caption,
    color: p.textMuted,
    textAlign: 'center',
  },
  emptyCta: {
    minHeight: 52,
    borderRadius: radii.control,
    backgroundColor: p.actionPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.x6,
    marginTop: space.x3,
    alignSelf: 'stretch',
  },
  emptyCtaText: {
    ...type.bodyStrong,
    color: p.canvasDeep,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
});
