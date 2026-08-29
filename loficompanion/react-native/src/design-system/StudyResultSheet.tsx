import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { radii, semantic, space, type } from '../theme/tokens';
import { AppIcon, IconName } from './AppIcon';
import { achievementSoft, mediaSurface } from './derivedTokens';

export type SheetAction = Readonly<{
  label: string;
  onPress: () => void;
}>;

type StudyResultSheetProps = Readonly<{
  visible: boolean;
  /** 本轮有效专注秒数 */
  sessionSeconds: number;
  todayMinutes: number;
  weekMinutes: number;
  weekTarget: number;
  /** 仅服务端确认的新成就（doc-08 §7：不伪造服务端成就） */
  newAchievement?: Readonly<{ name: string; rewardItemId: string }>;
  primaryAction: SheetAction;
  secondaryAction?: SheetAction;
  /** 减少动态：取消位移，只保留 100ms opacity（doc-07 §10） */
  reducedMotion?: boolean;
  /** 底部安全区高度（安全区 + 12 承载固定 CTA，doc-07 §7.1） */
  bottomInset?: number;
  /** Android 返回/点击遮罩时的关闭回调 */
  onDismiss?: () => void;
}>;

const ENTER_MS = 260;
const REDUCED_ENTER_MS = 100;
const ENTER_OFFSET = 24;
const PROGRESS_BAR_HEIGHT = 6;

function rewardIcon(rewardItemId: string): IconName {
  if (rewardItemId.includes('lamp')) return 'lamp';
  if (rewardItemId.includes('plant')) return 'plant';
  if (rewardItemId.includes('group')) return 'group';
  return 'bookmark';
}

/**
 * doc-08 §7/S06 完成结算：底部结果 sheet——圆角 24、内容可滚动、CTA 固定；
 * 位于完成媒体之上，使用媒体表面色（doc-07 §5）。
 * 入场 260ms 垂直 24dp + opacity；减少动态仅 100ms 淡入。
 */
export function StudyResultSheet({
  visible,
  sessionSeconds,
  todayMinutes,
  weekMinutes,
  weekTarget,
  newAchievement,
  primaryAction,
  secondaryAction,
  reducedMotion = false,
  bottomInset = 0,
  onDismiss,
}: StudyResultSheetProps) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      progress.setValue(0);
      return;
    }
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: reducedMotion ? REDUCED_ENTER_MS : ENTER_MS,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [visible, reducedMotion, progress]);

  const sessionMinutes = Math.round(sessionSeconds / 60);
  const weeklyRatio = weekTarget > 0 ? Math.min(1, weekMinutes / weekTarget) : 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: progress }]}>
          <Pressable
            accessibilityLabel="关闭结果"
            accessibilityRole="button"
            style={StyleSheet.absoluteFill}
            onPress={onDismiss}
          >
            <View style={[StyleSheet.absoluteFill, styles.backdrop]} />
          </Pressable>
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            {
              opacity: progress,
              transform: [
                {
                  translateY: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: reducedMotion ? [0, 0] : [ENTER_OFFSET, 0],
                  }),
                },
              ],
              paddingBottom: bottomInset + space.x3,
            },
          ]}
        >
          <ScrollView
            style={styles.contentScroll}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.resultRow}>
              <View style={styles.doneBadge}>
                <AppIcon name="check-circle" color={semantic.success} size={28} />
              </View>
              <View style={styles.resultText}>
                <Text style={styles.resultTitle}>专注 {sessionMinutes} 分钟</Text>
                <Text style={styles.resultMeta}>今日累计 {todayMinutes} 分钟</Text>
              </View>
            </View>

            <View style={styles.weekBlock}>
              <Text style={styles.weekLabel}>本周目标</Text>
              <View style={styles.weekTrack}>
                <View
                  style={[
                    styles.weekFill,
                    { width: `${Math.round(weeklyRatio * 100)}%` },
                  ]}
                />
              </View>
              <Text style={styles.weekValue}>
                {weekMinutes}/{weekTarget} 分钟
              </Text>
            </View>

            {newAchievement ? (
              <View style={styles.achievementRow}>
                <AppIcon
                  name={rewardIcon(newAchievement.rewardItemId)}
                  color={semantic.achievement}
                  size={20}
                />
                <Text style={styles.achievementText} numberOfLines={1}>
                  获得：{newAchievement.name}
                </Text>
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.ctaArea}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={primaryAction.label}
              onPress={primaryAction.onPress}
              style={({ pressed }) => [styles.primaryCta, pressed && styles.ctaPressed]}
            >
              <Text style={styles.primaryCtaText}>{primaryAction.label}</Text>
            </Pressable>
            {secondaryAction ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={secondaryAction.label}
                onPress={secondaryAction.onPress}
                style={({ pressed }) => [styles.secondaryCta, pressed && styles.ctaPressed]}
              >
                <Text style={styles.secondaryCtaText}>{secondaryAction.label}</Text>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'transparent',
  },
  backdrop: {
    backgroundColor: semantic.scrimBottom,
  },
  sheet: {
    maxHeight: '90%',
    backgroundColor: mediaSurface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: semantic.borderStandard,
    paddingTop: space.x5,
    paddingHorizontal: space.x4,
  },
  contentScroll: {
    flexShrink: 1,
  },
  content: {
    gap: space.x4,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x3,
  },
  doneBadge: {
    width: 44,
    height: 44,
    borderRadius: radii.round,
    backgroundColor: semantic.surfaceInset,
    borderWidth: 1,
    borderColor: semantic.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultText: {
    flexShrink: 1,
    gap: 2,
  },
  resultTitle: {
    ...type.title1,
    color: semantic.textPrimary,
  },
  resultMeta: {
    ...type.caption,
    color: semantic.textSecondary,
  },
  weekBlock: {
    gap: space.x2,
  },
  weekLabel: {
    ...type.label,
    color: semantic.textSecondary,
  },
  weekTrack: {
    height: PROGRESS_BAR_HEIGHT,
    borderRadius: radii.small,
    backgroundColor: semantic.surfaceInset,
    overflow: 'hidden',
  },
  weekFill: {
    height: '100%',
    borderRadius: radii.small,
    backgroundColor: semantic.actionPrimary,
  },
  weekValue: {
    ...type.caption,
    color: semantic.textMuted,
  },
  achievementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x2,
    backgroundColor: achievementSoft,
    borderRadius: radii.small,
    paddingHorizontal: space.x3,
    paddingVertical: space.x2,
  },
  achievementText: {
    ...type.bodyStrong,
    color: semantic.textPrimary,
    flexShrink: 1,
  },
  ctaArea: {
    paddingTop: space.x4,
    gap: space.x2,
  },
  primaryCta: {
    minHeight: 52,
    borderRadius: radii.control,
    backgroundColor: semantic.actionPrimary,
    paddingHorizontal: space.x5,
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
    paddingHorizontal: space.x4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryCtaText: {
    ...type.bodyStrong,
    color: semantic.textSecondary,
  },
  ctaPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.98 }],
  },
});
