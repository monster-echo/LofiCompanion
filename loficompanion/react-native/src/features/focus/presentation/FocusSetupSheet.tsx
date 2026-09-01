import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { replaceRoute } from '../../../navigation/navigationRef';
import { useApp } from '../../../state/AppStore';
import { usePreferences } from '../../../preferences/PreferencesProvider';
import { radii, space, type, type ThemeColors } from '../../../theme/tokens';
import { useThemeStyles } from '../../../theme/useThemeStyles';
import { useFocus } from '../application/FocusStore';
import { useMusicLibrary } from '../../music/application/useMusicLibrary';
import type { ActivityType } from '../domain/types';
import {
  DEFAULT_ACTIVITY,
  DEFAULT_DURATION,
  QUICK_DURATIONS,
  validateCustomDuration,
  validateSessionInput,
} from '../domain/validate';
import { SheetOverlay } from './SheetOverlay';
import { useTranslation } from 'react-i18next';

/**
 * S03 创建专注（doc-08 §4）。本屏唯一焦点：这一次要做什么。
 * 活动单选 chips + 时长分段 + 自定义输入（就地报错）；路由本体是
 * transparentModal，sheet 结构由 SheetOverlay 承担，开始后原位替换为专注页。
 */
export function FocusSetupSheet() {
  const { palette } = usePreferences();
  const styles = useThemeStyles(makeStyles);
  const focus = useFocus();
  const { t } = useTranslation('focus');
  const { back, showToast, signedIn } = useApp();
  const music = useMusicLibrary(signedIn);
  const [activity, setActivity] = useState<ActivityType>(DEFAULT_ACTIVITY);
  const [minutes, setMinutes] = useState<number>(DEFAULT_DURATION);
  const [customText, setCustomText] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // 自定义输入：合法即选中（取消分段高亮），非法就地提示，不用 Toast（doc-08 §4）
  const onCustomChange = (text: string) => {
    setCustomText(text);
    setFormError(null);
    const trimmed = text.trim();
    if (trimmed === '') {
      setMinutes(DEFAULT_DURATION);
      return;
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (validateCustomDuration(parsed) === null) {
      setFormError(t('customError'));
      return;
    }
    setMinutes(parsed);
  };

  const chooseQuick = (value: number) => {
    setMinutes(value);
    setCustomText('');
    setFormError(null);
  };

  const begin = () => {
    if (!validateSessionInput(activity, minutes)) {
      setFormError(t('customError'));
      return;
    }
    const result = focus.actions.startSession(activity, minutes, Date.now());
    if (result.ok) {
      replaceRoute('focus.active');
      return;
    }
    if (result.reason === 'alreadyActive') {
      showToast(t('sessionRunning'), 'info');
      replaceRoute('focus.active');
      return;
    }
    setFormError(t('invalidSession'));
  };

  return (
    <SheetOverlay onClose={back} reducedMotion={focus.reducedMotion}>
      <Text style={styles.title}>{t('setupTitle')}</Text>

      {/* 活动单选：两行内排列 */}
      <View style={styles.chipWrap}>
        {(['homework', 'reading', 'coding', 'vocab', 'free'] as const).map((option) => {
          const selected = activity === option;
          return (
            <Pressable
              key={option}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => {
                setActivity(option);
                setFormError(null);
              }}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {t(`activity.${option}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* 时长分段：四个等宽 + 自定义行 */}
      <View style={styles.segmentRow}>
        {QUICK_DURATIONS.map((value) => {
          const selected = minutes === value;
          return (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${value} ${t('customUnit')}`}
              onPress={() => chooseQuick(value)}
              style={[styles.segment, selected && styles.segmentSelected]}
            >
              <Text style={[styles.segmentText, selected && styles.chipTextSelected]}>
                {value}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.customRow}>
        <Text style={styles.customLabel}>{t('customLabel')}</Text>
        <TextInput
          accessibilityLabel={`${t('customLabel')}${t('customUnit')}`}
          value={customText}
          onChangeText={onCustomChange}
          keyboardType="number-pad"
          placeholder={t('customPlaceholder')}
          placeholderTextColor={palette.textMuted}
          style={styles.customInput}
          maxLength={3}
        />
        <Text style={styles.customUnit}>{t('customUnit')}</Text>
      </View>

      {/* 背景音乐选曲：胶囊横向滚动；访客仅内置两首并给出登录提示。
          选择即生效（控制器记录，开始专注后自动播放） */}
      <View style={styles.musicRow}>
        <Text style={styles.musicLabel}>{t('musicLabel')}</Text>
        {!signedIn ? <Text style={styles.musicHint}>{t('musicGuestHint')}</Text> : null}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.musicChips}
      >
        {music.tracks.map((track) => {
          const selected = music.selectedTrack?.id === track.id;
          return (
            <Pressable
              key={track.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${t('musicLabel')} ${track.title}`}
              onPress={() => music.selectTrack(track)}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {track.title}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {formError ? (
        <Text role="alert" style={styles.errorText}>
          {formError}
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('beginFocus')}
        onPress={begin}
        style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
      >
        <Text style={styles.ctaText}>{t('beginFocus')}</Text>
      </Pressable>
    </SheetOverlay>
  );
}

const makeStyles = (p: ThemeColors) => StyleSheet.create({
  title: {
    ...type.title2,
    color: p.textPrimary,
    marginBottom: space.x4,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.x2,
  },
  chip: {
    height: 40,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: p.borderStandard,
    backgroundColor: p.surfaceRaised,
    paddingHorizontal: space.x4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: {
    backgroundColor: p.brandSoft,
    borderColor: p.borderEmphasis,
  },
  chipText: {
    ...type.bodyStrong,
    color: p.textSecondary,
  },
  chipTextSelected: {
    color: p.actionPrimary,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: space.x2,
    marginTop: space.x4,
  },
  segment: {
    flex: 1,
    height: 40,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: p.borderStandard,
    backgroundColor: p.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentSelected: {
    backgroundColor: p.brandSoft,
    borderColor: p.borderEmphasis,
  },
  segmentText: {
    ...type.bodyStrong,
    color: p.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x3,
    marginTop: space.x3,
  },
  customLabel: {
    ...type.body,
    color: p.textSecondary,
  },
  customInput: {
    width: 96,
    height: 44,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: p.borderStandard,
    backgroundColor: p.surfaceInset,
    color: p.textPrimary,
    textAlign: 'center',
    ...type.bodyStrong,
    paddingVertical: 0,
  },
  customUnit: {
    ...type.caption,
    color: p.textMuted,
  },
  musicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x2,
    marginTop: space.x4,
  },
  musicLabel: {
    ...type.body,
    color: p.textSecondary,
  },
  musicHint: {
    ...type.caption,
    color: p.textMuted,
  },
  musicChips: {
    flexDirection: 'row',
    gap: space.x2,
    paddingVertical: space.x2,
  },
  errorText: {
    ...type.caption,
    color: p.danger,
    marginTop: space.x2,
  },
  cta: {
    minHeight: 52,
    borderRadius: radii.control,
    backgroundColor: p.actionPrimary,
    marginTop: space.x5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    ...type.bodyStrong,
    color: p.canvasDeep,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
});
