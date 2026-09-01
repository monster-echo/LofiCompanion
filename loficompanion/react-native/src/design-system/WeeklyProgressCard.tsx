import React, { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { radii, semantic, space, type } from '../theme/tokens';
import { useTranslation } from 'react-i18next';

type WeeklyProgressCardProps = Readonly<{
  weekMinutes: number;
  targetMinutes: number;
  /** 周一到周日七天的专注分钟；缺失日由调用方给 0（不插值） */
  days: readonly number[];
  /** 覆盖「今天」高亮下标（0=一 … 6=日）；缺省按设备时区推断 */
  todayIndex?: number;
}>;

const CHART_HEIGHT = 160;
const BAR_WIDTH = 12;
const BAR_RADIUS = 3;

/** 周一为一周首日：JS getDay 0=周日 → 下标 6 */
export function currentWeekDayIndex(now: Date): number {
  return (now.getDay() + 6) % 7;
}

/**
 * doc-08 §9/S08 首卡：本周专注分钟 + 七日柱图。
 * 图表高 160、柱宽 12 圆角 3；轨道 surfaceInset、柱体 actionPrimary、今日高亮；
 * 坐标轴 micro/textMuted；不足七天按 0 渲染，不插值。
 */
export function WeeklyProgressCard({
  weekMinutes,
  targetMinutes,
  days,
  todayIndex = currentWeekDayIndex(new Date()),
}: WeeklyProgressCardProps) {
  const { t } = useTranslation('common');
  const dayLabels = [0, 1, 2, 3, 4, 5, 6].map((i) => t(`dayShort${i}` as 'dayShort0'));
  const [chartWidth, setChartWidth] = useState(0);
  const values = normalizeDays(days);
  const peak = Math.max(targetMinutes, ...values, 1);
  const slotWidth = chartWidth > 0 ? chartWidth / values.length : 0;
  const barX = slotWidth > 0 ? (slotWidth - BAR_WIDTH) / 2 : 0;

  const onLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    setChartWidth((prev) => (Math.abs(prev - width) < 1 ? prev : width));
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>本周专注 {weekMinutes} 分钟</Text>
        {targetMinutes > 0 ? (
          <Text style={styles.target}>目标 {targetMinutes} 分钟</Text>
        ) : null}
      </View>
      <View style={styles.chart} onLayout={onLayout}>
        {slotWidth > 0
          ? values.map((minutes, index) => {
              const filledHeight = Math.max(
                minutes > 0 ? BAR_RADIUS * 2 : 0,
                Math.round((Math.min(minutes, peak) / peak) * CHART_HEIGHT),
              );
              const y = CHART_HEIGHT - filledHeight;
              const isToday = index === todayIndex;
              return (
                <Svg
                  key={`${index}-${minutes}`}
                  width={slotWidth}
                  height={CHART_HEIGHT}
                  style={{ position: 'absolute', left: index * slotWidth, top: 0 }}
                >
                  <Rect
                    x={barX}
                    y={0}
                    width={BAR_WIDTH}
                    height={CHART_HEIGHT}
                    rx={BAR_RADIUS}
                    fill={semantic.surfaceInset}
                  />
                  {minutes > 0 ? (
                    <Rect
                      x={barX}
                      y={y}
                      width={BAR_WIDTH}
                      height={filledHeight}
                      rx={BAR_RADIUS}
                      fill={isToday ? semantic.actionFocus : semantic.actionPrimary}
                    />
                  ) : null}
                </Svg>
              );
            })
          : null}
      </View>
      <View style={styles.axis}>
        {dayLabels.map((label, index) => (
          <Text
            key={label}
            style={[
              styles.axisLabel,
              { width: slotWidth > 0 ? slotWidth : `${100 / 7}%` },
              index === todayIndex && styles.axisLabelToday,
            ]}
          >
            {label}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** 恰好七天：多截少补 0（缺失日为 0，不插值） */
function normalizeDays(days: readonly number[]): number[] {
  const safe = days.map((minutes) => Math.max(0, minutes));
  while (safe.length < 7) safe.push(0);
  return safe.slice(0, 7);
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: semantic.surface,
    borderWidth: 1,
    borderColor: semantic.borderSoft,
    borderRadius: radii.card,
    padding: space.x4,
    gap: space.x3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    ...type.title3,
    color: semantic.textPrimary,
    flexShrink: 1,
  },
  target: {
    ...type.caption,
    color: semantic.textMuted,
    marginLeft: space.x2,
  },
  chart: {
    height: CHART_HEIGHT,
    overflow: 'hidden',
  },
  axis: {
    flexDirection: 'row',
  },
  axisLabel: {
    ...type.micro,
    color: semantic.textMuted,
    textAlign: 'center',
  },
  axisLabelToday: {
    color: semantic.actionFocus,
  },
});
