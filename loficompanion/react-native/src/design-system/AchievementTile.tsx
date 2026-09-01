import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import type { AchievementDef, RoomItemId } from '../features/achievements/domain/rules';
import { useTranslation } from 'react-i18next';
import { currentLanguage } from '../i18n/core';
import { radii, space, type, ThemeColors } from '../theme/tokens';
import { useThemeStyles } from '../theme/useThemeStyles';
import { usePreferences } from '../preferences/PreferencesProvider';
import { AppIcon, IconName } from './AppIcon';

type AchievementTileProps = Readonly<{
  def: AchievementDef;
  /** 成就名/描述（i18n 解析后传入，tile 保持无 locale 依赖） */
  name: string;
  description: string;
  unlocked: boolean;
  /** 解锁时间（epoch ms），解锁卡右下角以 caption 展示 */
  unlockedAt?: number;
}>;

const TEXT_ZONE_HEIGHT = 52;

// RN 0.86 已移除 StyleSheet.absoluteFillObject，统一用显式填充
const absoluteFill = {
  position: 'absolute' as const,
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
};

// doc-07 §8：成就用书签/台灯/书本（收藏物），不用奖杯
const REWARD_ICONS: Record<RoomItemId, IconName> = {
  bookmark: 'bookmark',
  lamp: 'lamp',
  plant: 'plant',
  group_photo: 'group',
};

let gradientSeq = 0;

function formatUnlockDate(epochMs: number): string {
  try {
    return new Intl.DateTimeFormat(currentLanguage(), { month: 'long', day: 'numeric' }).format(
      new Date(epochMs),
    );
  } catch {
    return '';
  }
}

/**
 * doc-08 §7/S07 成就卡：图像区 1.6:1 + 52dp 文字区。
 * Task 11 立绘到位前用「图标先行」占位：解锁=渐变块+收藏物图标；
 * 锁定=降饱和/降不透明度块 + 居中 SVG 锁图标。
 */
export function AchievementTile({ def, name, description, unlocked, unlockedAt }: AchievementTileProps) {
  const { t } = useTranslation('achievements');
  const { palette } = usePreferences();
  const styles = useThemeStyles(makeStyles);
  const gradientId = React.useMemo(() => {
    gradientSeq += 1;
    return `achievement-art-${gradientSeq}`;
  }, []);
  const rewardIcon = REWARD_ICONS[def.rewardItemId] ?? 'bookmark';

  return (
    <View
      style={styles.card}
      accessibilityLabel={
        unlocked
          ? t('tileUnlockedA11y', { name, date: unlockedAt ? formatUnlockDate(unlockedAt) : '' })
          : t('tileLockedA11y', { name, description })
      }
    >
      <View style={styles.art}>
        {unlocked ? (
          <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
            <Defs>
              <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={palette.surfaceRaised} />
                <Stop offset="1" stopColor={palette.surfaceInset} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gradientId})`} />
          </Svg>
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.surfaceInset }]} />
        )}
        <View style={[styles.artContent, unlocked ? undefined : styles.artLocked]}>
          <AppIcon
            name={unlocked ? rewardIcon : 'lock'}
            color={unlocked ? palette.achievement : palette.textMuted}
            size={unlocked ? 32 : 20}
          />
        </View>
      </View>
      <View style={styles.textZone}>
        <Text style={[styles.name, !unlocked && styles.nameLocked]} numberOfLines={1}>
          {name}
        </Text>
        <Text style={[styles.description, !unlocked && styles.nameLocked]} numberOfLines={1}>
          {unlocked && unlockedAt ? formatUnlockDate(unlockedAt) : description}
        </Text>
      </View>
    </View>
  );
}

const makeStyles = (p: ThemeColors) => StyleSheet.create({
  card: {
    backgroundColor: p.surface,
    borderWidth: 1,
    borderColor: p.borderSoft,
    borderRadius: radii.card,
    overflow: 'hidden',
  },
  art: {
    aspectRatio: 1.6,
    backgroundColor: p.surfaceInset,
  },
  artContent: {
    ...absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  artLocked: {
    opacity: 0.4,
  },
  textZone: {
    height: TEXT_ZONE_HEIGHT,
    paddingHorizontal: space.x3,
    paddingVertical: space.x2,
    justifyContent: 'center',
    gap: 2,
  },
  name: {
    ...type.bodyStrong,
    color: p.textPrimary,
  },
  description: {
    ...type.caption,
    color: p.textSecondary,
  },
  nameLocked: {
    color: p.textMuted,
  },
});
