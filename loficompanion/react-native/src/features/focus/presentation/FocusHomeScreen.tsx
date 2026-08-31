import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CompanionState } from '../../skins/domain/types';
import { ImmersiveMediaSurface } from '../../skins/presentation/ImmersiveMediaSurface';
import { AppIcon } from '../../../design-system/AppIcon';
import type { IconName } from '../../../design-system/AppIcon';
import { formatTimerSeconds } from '../../../design-system/FocusTimerRing';
import { useApp } from '../../../state/AppStore';
import { useFocus } from '../application/FocusStore';
import { DEFAULT_ACTIVITY, DEFAULT_DURATION } from '../domain/validate';
import { mediaControl, mediaSurface } from '../../../design-system/derivedTokens';
import { radii, semantic, space, type } from '../../../theme/tokens';
import { ACTIVITY_LABELS, FOCUS_STRINGS as STR } from './strings';
import { SKIN_STRINGS as SKIN } from '../../skins/presentation/strings';

/**
 * S02 今日陪伴首页（doc-08 §3）。本屏唯一焦点：角色媒体 +「开始专注」。
 * 媒体背景自屏幕顶部延伸到 Tab bar 上方；底部结果板承载今日战绩与主 CTA。
 */
export function FocusHomeScreen() {
  const focus = useFocus();
  const { navigate, showToast } = useApp();
  const active = focus.activeSession;
  const firstRun = focus.today.minutes === 0 && focus.today.sessions === 0;

  // 有会话时媒体跟随陪伴状态（暂停/喝水动作可见）；无会话回 ready 基态
  const mediaState: CompanionState = active
    ? focus.companion.playing?.state ?? focus.companion.state
    : 'ready';

  const startFocus = () => {
    const result = focus.actions.startSession(DEFAULT_ACTIVITY, DEFAULT_DURATION, Date.now());
    if (result.ok) {
      navigate('focus.active');
      return;
    }
    if (result.reason === 'alreadyActive') {
      showToast(STR.sessionRunning, 'info');
      navigate('focus.active');
      return;
    }
    showToast(STR.invalidSession, 'error');
  };

  const primaryLabel = active
    ? `${STR.backToFocus} · ${formatTimerSeconds(focus.remainingSeconds)}`
    : STR.startFocus;

  const selectorLabel = `${ACTIVITY_LABELS[DEFAULT_ACTIVITY]} · ${DEFAULT_DURATION} 分钟`;

  return (
    <View style={styles.screen}>
      <View style={styles.mediaArea}>
        <ImmersiveMediaSurface
          manifest={focus.skin}
          state={mediaState}
          reducedMotion={focus.reducedMotion}
          style={StyleSheet.absoluteFill}
        />

        {/* 左上皮肤入口 / 右上设置（doc-08 §3：44×44，距安全边 8） */}
        <View style={styles.topBar}>
          <CircleEntry
            label={SKIN.skinEntry}
            icon="lamp"
            onPress={() => navigate('skins.gallery')}
          />
          <CircleEntry label="设置" icon="settings" onPress={() => navigate('settings.home')} />
        </View>

        {/* 问候（安全区下 72、左 20）+ 在线状态 */}
        <View style={styles.greeting} pointerEvents="none">
          <Text style={styles.greetingText}>{STR.greeting}</Text>
          <View style={styles.onlineRow}>
            <View style={styles.onlineDot} />
            <Text style={styles.onlineText}>{STR.online}</Text>
          </View>
        </View>

        {/* 底部结果板（高约 196、左右 16、Tab bar 上 12） */}
        <View style={styles.board}>
          {firstRun ? (
            <Text style={styles.boardEmpty}>{STR.boardEmpty}</Text>
          ) : (
            <View style={styles.statsRow}>
              <Text style={styles.statMain}>{STR.todayMinutes(focus.today.minutes)}</Text>
              <Text style={styles.statSub}>{STR.doneSessions(focus.today.sessions)}</Text>
            </View>
          )}
          <View style={styles.boardActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={active ? STR.backToFocus : STR.startFocus}
              onPress={active ? () => navigate('focus.active') : startFocus}
              style={({ pressed }) => [styles.primaryCta, pressed && styles.pressed]}
            >
              <Text style={styles.primaryCtaText}>{primaryLabel}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={STR.chooseActivity}
              onPress={() => navigate('focus.setup')}
              style={({ pressed }) => [styles.selector, pressed && styles.pressed]}
            >
              <Text style={styles.selectorText}>{selectorLabel}</Text>
              <AppIcon name="chevron-down" color={semantic.textMuted} size={18} />
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

function CircleEntry({ label, icon, onPress }: Readonly<{
  label: string;
  icon: IconName;
  onPress: () => void;
}>) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.entry, pressed && styles.pressed]}
    >
      <AppIcon name={icon} color={semantic.textPrimary} size={22} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semantic.canvasDeep,
  },
  mediaArea: {
    flex: 1,
    overflow: 'hidden',
  },
  topBar: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  entry: {
    width: 44,
    height: 44,
    borderRadius: radii.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: mediaControl,
  },
  greeting: {
    position: 'absolute',
    top: 72,
    left: 20,
    gap: space.x2,
  },
  greetingText: {
    ...type.title2,
    color: semantic.textPrimary,
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
    backgroundColor: semantic.success,
  },
  onlineText: {
    ...type.caption,
    color: semantic.textSecondary,
  },
  board: {
    position: 'absolute',
    left: space.x4,
    right: space.x4,
    bottom: space.x3,
    height: 196,
    borderRadius: radii.card,
    backgroundColor: mediaSurface,
    borderWidth: 1,
    borderColor: semantic.borderSoft,
    paddingHorizontal: space.x5,
    paddingVertical: space.x4,
    justifyContent: 'space-between',
  },
  boardEmpty: {
    ...type.body,
    color: semantic.textSecondary,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  statMain: {
    ...type.title1,
    color: semantic.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  statSub: {
    ...type.body,
    color: semantic.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  boardActions: {
    gap: space.x3,
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
  selector: {
    minHeight: 48,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: semantic.borderStandard,
    paddingHorizontal: space.x4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectorText: {
    ...type.bodyStrong,
    color: semantic.textPrimary,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
});
