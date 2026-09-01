import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AchievementTile } from '../../../design-system/AchievementTile';
import { AppIcon, IconName } from '../../../design-system/AppIcon';
import { useApp } from '../../../state/AppStore';
import { radii, semantic, space, type } from '../../../theme/tokens';
import type { SkinManifest } from '../../skins/domain/types';
import { useFocus } from '../../focus/application/FocusStore';
import { ACHIEVEMENT_DEFS } from '../domain/rules';
import {
  completedEntries,
  formatHours,
  streakDays,
  totalEffectiveSeconds,
} from '../domain/insights';
import { useTranslation } from 'react-i18next';
import { ImmersiveMediaSurface } from '../../skins/presentation/ImmersiveMediaSurface';

/**
 * S07 学习成就（doc-08 §8）。Tab 根页：指标区 + 我的成就网格。
 * 不设页内标题栏（Tab 标签已表达语义）；设置入口在「我的」页。
 * 指标全部由本地历史推导（completed 口径，abandoned 不入）；
 * 空状态不显示零值大卡——展示当前房间、第一项成就条件和「开始第一轮」。
 */
export function AchievementsScreen() {
  const focus = useFocus();
  const { t } = useTranslation('achievements');
  const { navigate, replace } = useApp();
  const insets = useSafeAreaInsets();

  const entries = completedEntries(focus.history);
  const now = Date.now();
  const grantedAt = new Map(focus.granted.map((grant) => [grant.ruleKey, grant.grantedAtUtc]));
  const empty = entries.length === 0;

  const metrics: readonly { label: string; value: string; unit: string }[] = [
    { label: t('metricTotal'), value: formatHours(totalEffectiveSeconds(entries)), unit: t('unitHours') },
    { label: t('metricRounds'), value: String(entries.length), unit: t('unitRounds') },
    { label: t('metricStreak'), value: String(streakDays(entries, now)), unit: t('unitDays') },
    { label: t('metricWeek'), value: String(focus.week.minutes), unit: t('unitMinutes') },
  ];

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          // 悬浮 Tab 覆盖场景底部：滚动内容尾部留出 Tab 高度，末尾条目可点
          { paddingBottom: Math.max(insets.bottom + space.x6, 104) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {empty ? (
          <EmptyState
            manifest={focus.skin}
            reducedMotion={focus.reducedMotion}
            onStart={() => replace('home')}
          />
        ) : (
          <>
            {/* 2×2 指标区：单格 82 高、间距 8，大值 displayMetric */}
            <View style={styles.metrics}>
              {metrics.map((metric) => (
                <View
                  key={metric.label}
                  style={styles.metricCell}
                  accessibilityLabel={`${metric.label} ${metric.value} ${metric.unit}`}
                >
                  <Text style={styles.metricLabel}>{metric.label}</Text>
                  <View style={styles.metricValueRow}>
                    <Text style={styles.metricValue}>{metric.value}</Text>
                    <Text style={styles.metricUnit}>{metric.unit}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* S07 → S08/S09 入口行 */}
            <View style={styles.links}>
              <LinkRow label={t('historyLink')} icon="check-circle" onPress={() => navigate('history.week')} />
              <LinkRow label={t('roomLink')} icon="home" onPress={() => navigate('room.home')} />
            </View>

            {/* 我的成就：2 列网格覆盖全部 4 条定义，解锁 = granted 含 ruleKey */}
            <Text style={styles.sectionTitle}>{t('myAchievements')}</Text>
            <View style={styles.grid}>
              {ACHIEVEMENT_DEFS.map((def) => {
                const unlockedAt = grantedAt.get(def.ruleKey);
                return (
                  <View key={def.ruleKey} style={styles.gridCell}>
                    <AchievementTile
                      def={def}
                      name={t(`rule.${def.ruleKey}.name`)}
                      description={t(`rule.${def.ruleKey}.description`)}
                      unlocked={unlockedAt !== undefined}
                      unlockedAt={unlockedAt}
                    />
                  </View>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>

    </View>
  );
}

/** 空状态（doc-08 §8）：当前房间 + 第一项成就条件 + 开始第一轮 */
function EmptyState({
  manifest,
  reducedMotion,
  onStart,
}: Readonly<{
  manifest: SkinManifest;
  reducedMotion: boolean;
  onStart: () => void;
}>) {
  const { t } = useTranslation('achievements');
  const firstDef = ACHIEVEMENT_DEFS[0];
  return (
    <View style={styles.empty}>
      <View style={styles.emptyMedia}>
        <ImmersiveMediaSurface
          manifest={manifest}
          state="ready"
          reducedMotion={reducedMotion}
          style={StyleSheet.absoluteFill}
        />
        <Text style={styles.emptyMediaCaption}>{`${t('emptyRoomCaption')} · ${manifest.name}`}</Text>
      </View>
      <Text style={styles.emptyHint}>{t('emptyHint')}</Text>
      <Text style={styles.emptyCondition}>{`${t(`rule.${firstDef.ruleKey}.name`)} · ${t(`rule.${firstDef.ruleKey}.description`)}`}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('startFirstRound')}
        onPress={onStart}
        style={({ pressed }) => [styles.emptyCta, pressed && styles.pressed]}
      >
        <Text style={styles.emptyCtaText}>{t('startFirstRound')}</Text>
      </Pressable>
    </View>
  );
}

function LinkRow({
  label,
  icon,
  onPress,
}: Readonly<{ label: string; icon: IconName; onPress: () => void }>) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}
    >
      <AppIcon name={icon} color={semantic.actionFocus} size={20} />
      <Text style={styles.linkLabel}>{label}</Text>
      <AppIcon name="chevron-right" color={semantic.textMuted} size={18} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semantic.canvas,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingTop: space.x5,
    paddingHorizontal: space.x4,
    paddingBottom: space.x6,
    gap: space.x6,
  },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.x2,
  },
  metricCell: {
    flexBasis: '48%',
    flexGrow: 1,
    height: 82,
    borderRadius: radii.card,
    backgroundColor: semantic.surface,
    borderWidth: 1,
    borderColor: semantic.borderSoft,
    paddingHorizontal: space.x3,
    paddingVertical: space.x2,
    justifyContent: 'center',
    gap: 2,
  },
  metricLabel: {
    ...type.caption,
    color: semantic.textMuted,
  },
  metricValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.x1,
  },
  metricValue: {
    ...type.displayMetric,
    color: semantic.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  metricUnit: {
    ...type.caption,
    color: semantic.textSecondary,
  },
  links: {
    gap: space.x2,
  },
  linkRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x3,
    paddingHorizontal: space.x4,
    borderRadius: radii.card,
    backgroundColor: semantic.surface,
    borderWidth: 1,
    borderColor: semantic.borderSoft,
  },
  linkLabel: {
    ...type.bodyStrong,
    color: semantic.textPrimary,
    flex: 1,
  },
  sectionTitle: {
    ...type.title3,
    color: semantic.textPrimary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.x3,
  },
  gridCell: {
    // 两列等宽撑满：与指标区同款 48% + flexGrow，间距 12 下两列恰好铺满
    flexBasis: '48%',
    flexGrow: 1,
  },
  empty: {
    gap: space.x4,
  },
  emptyMedia: {
    height: 180,
    borderRadius: radii.card,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  emptyMediaCaption: {
    ...type.caption,
    color: semantic.textSecondary,
    margin: space.x3,
  },
  emptyHint: {
    ...type.body,
    color: semantic.textSecondary,
  },
  emptyCondition: {
    ...type.bodyStrong,
    color: semantic.textPrimary,
  },
  emptyCta: {
    minHeight: 52,
    borderRadius: radii.control,
    backgroundColor: semantic.actionPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.x1,
  },
  emptyCtaText: {
    ...type.bodyStrong,
    color: semantic.canvasDeep,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
});
