import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { semantic, space, type } from '../theme/tokens';
import { fonts } from './fonts';
import { i18n } from '../i18n/core';

type FocusTimerRingProps = Readonly<{
  remainingSeconds: number;
  totalSeconds: number;
  /** doc-08 §5：专注页直径 196、描边 4；可按场景缩小（喝水事件小环等） */
  size?: number;
  strokeWidth?: number;
  /** 计时下方的时长说明（如「本轮 25 分钟」） */
  durationLabel?: string;
}>;

const BASE_SIZE = 196;
const BASE_TIMER = type.displayTimer;

/** mm:ss；倒计时向上取整，归零不出现负数 */
export function formatTimerSeconds(totalSeconds: number): string {
  const safe = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * doc-08 §4/S04：196 直径计时环——borderSoft 轨道 + actionPrimary 进度，
 * 圆头描边、起点 12 点方向；中心 tabular 数字衬线计时。
 */
export function FocusTimerRing({
  remainingSeconds,
  totalSeconds,
  size = BASE_SIZE,
  strokeWidth = 4,
  durationLabel,
}: FocusTimerRingProps) {
  const scale = size / BASE_SIZE;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = Math.max(1, totalSeconds);
  const fraction = Math.min(1, Math.max(0, remainingSeconds / total));

  const timerStyle = {
    ...BASE_TIMER,
    fontFamily: fonts.serif,
    fontSize: Math.round(BASE_TIMER.fontSize * scale),
    lineHeight: Math.round(BASE_TIMER.lineHeight * scale),
    // doc-07 §6.2：计时数字 tracking 0.02em（RN 用 pt 表达）
    letterSpacing: BASE_TIMER.fontSize * scale * 0.02,
    color: semantic.textPrimary,
  };

  return (
    <View
      style={[styles.container, { width: size, height: size }]}
      accessibilityRole="text"
      accessibilityLabel={
        durationLabel
          ? i18n.t('common:remaining', { time: formatTimerSeconds(remainingSeconds) }) + `，${durationLabel}`
          : i18n.t('common:remaining', { time: formatTimerSeconds(remainingSeconds) })
      }
    >
      <Svg width={size} height={size} style={styles.ring}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={semantic.borderSoft}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {fraction > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={semantic.actionPrimary}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${fraction * circumference} ${circumference}`}
            // 12 点方向起点
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
      <View style={styles.center}>
        <Text style={timerStyle}>{formatTimerSeconds(remainingSeconds)}</Text>
        {durationLabel ? (
          <Text style={[styles.duration, { marginTop: Math.round(space.x1 * scale) }]}>
            {durationLabel}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', left: 0, top: 0 },
  center: { alignItems: 'center', justifyContent: 'center' },
  duration: {
    ...type.caption,
    color: semantic.textSecondary,
  },
});
