import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { replaceRoute } from '../../../navigation/navigationRef';
import { useApp } from '../../../state/AppStore';
import { colors, radii, semantic, space, type } from '../../../theme/tokens';
import { useFocus } from '../application/FocusStore';
import type { ActivityType } from '../domain/types';
import {
  DEFAULT_ACTIVITY,
  DEFAULT_DURATION,
  QUICK_DURATIONS,
  validateCustomDuration,
  validateSessionInput,
} from '../domain/validate';
import { SheetOverlay } from './SheetOverlay';
import { ACTIVITY_OPTIONS, FOCUS_STRINGS as STR } from './strings';

/**
 * S03 创建专注（doc-08 §4）。本屏唯一焦点：这一次要做什么。
 * 活动单选 chips + 时长分段 + 自定义输入（就地报错）；路由本体是
 * transparentModal，sheet 结构由 SheetOverlay 承担，开始后原位替换为专注页。
 */
export function FocusSetupSheet() {
  const focus = useFocus();
  const { back, showToast } = useApp();
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
      setFormError(STR.customError);
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
      setFormError(STR.customError);
      return;
    }
    const result = focus.actions.startSession(activity, minutes, Date.now());
    if (result.ok) {
      replaceRoute('focus.active');
      return;
    }
    if (result.reason === 'alreadyActive') {
      showToast(STR.sessionRunning, 'info');
      replaceRoute('focus.active');
      return;
    }
    setFormError(STR.invalidSession);
  };

  return (
    <SheetOverlay onClose={back} closeLabel="关闭" reducedMotion={focus.reducedMotion}>
      <Text style={styles.title}>{STR.setupTitle}</Text>

      {/* 活动单选：两行内排列 */}
      <View style={styles.chipWrap}>
        {ACTIVITY_OPTIONS.map((option) => {
          const selected = activity === option.type;
          return (
            <Pressable
              key={option.type}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => {
                setActivity(option.type);
                setFormError(null);
              }}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {option.label}
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
              accessibilityLabel={`${value} 分钟`}
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
        <Text style={styles.customLabel}>{STR.customLabel}</Text>
        <TextInput
          accessibilityLabel={`${STR.customLabel}${STR.customUnit}`}
          value={customText}
          onChangeText={onCustomChange}
          keyboardType="number-pad"
          placeholder={STR.customPlaceholder}
          placeholderTextColor={semantic.textMuted}
          style={styles.customInput}
          maxLength={3}
        />
        <Text style={styles.customUnit}>{STR.customUnit}</Text>
      </View>
      {formError ? (
        <Text role="alert" style={styles.errorText}>
          {formError}
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={STR.beginFocus}
        onPress={begin}
        style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
      >
        <Text style={styles.ctaText}>{STR.beginFocus}</Text>
      </Pressable>
    </SheetOverlay>
  );
}

const styles = StyleSheet.create({
  title: {
    ...type.title2,
    color: semantic.textPrimary,
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
    borderColor: semantic.borderStandard,
    backgroundColor: semantic.surfaceRaised,
    paddingHorizontal: space.x4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: {
    backgroundColor: colors.brandSoft,
    borderColor: semantic.borderEmphasis,
  },
  chipText: {
    ...type.bodyStrong,
    color: semantic.textSecondary,
  },
  chipTextSelected: {
    color: semantic.actionPrimary,
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
    borderColor: semantic.borderStandard,
    backgroundColor: semantic.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentSelected: {
    backgroundColor: colors.brandSoft,
    borderColor: semantic.borderEmphasis,
  },
  segmentText: {
    ...type.bodyStrong,
    color: semantic.textSecondary,
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
    color: semantic.textSecondary,
  },
  customInput: {
    width: 96,
    height: 44,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: semantic.borderStandard,
    backgroundColor: semantic.surfaceInset,
    color: semantic.textPrimary,
    textAlign: 'center',
    ...type.bodyStrong,
    paddingVertical: 0,
  },
  customUnit: {
    ...type.caption,
    color: semantic.textMuted,
  },
  errorText: {
    ...type.caption,
    color: semantic.danger,
    marginTop: space.x2,
  },
  cta: {
    minHeight: 52,
    borderRadius: radii.control,
    backgroundColor: semantic.actionPrimary,
    marginTop: space.x5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    ...type.bodyStrong,
    color: semantic.canvasDeep,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
});
