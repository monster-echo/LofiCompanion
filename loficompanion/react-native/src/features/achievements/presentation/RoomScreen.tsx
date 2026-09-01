import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { AppIcon } from '../../../design-system/AppIcon';
import { useApp } from '../../../state/AppStore';
import { mediaControl } from '../../../design-system/derivedTokens';
import { radii, semantic, space, type } from '../../../theme/tokens';
import { useFocus } from '../../focus/application/FocusStore';
import { ImmersiveMediaSurface } from '../../skins/presentation/ImmersiveMediaSurface';
import { useTranslation } from 'react-i18next';
import { ACHIEVEMENT_DEFS, type RoomItemId } from '../domain/rules';
import { getMusicController } from '../../music/data/expoAudioMusicController';

/**
 * S09 我的陪伴房间（doc-08 §10）。媒体/房间占顶部至约 66%；已解锁收藏物
 * 以 44×44 透明热点摆在固定位置，点击仅显示当前物品 callout（引线 P0-A
 * 省略）；未解锁槽位不显示。底部为说明与「布置房间」（布置模式属 P0-B，
 * 以禁用次按钮 + 徽标提示）。
 */

/** 收藏物在媒体区域的固定热点位置（媒体区域宽高比例坐标） */
const HOTSPOTS: Record<RoomItemId, { x: number; y: number }> = {
  bookmark: { x: 0.18, y: 0.22 },
  lamp: { x: 0.8, y: 0.3 },
  plant: { x: 0.12, y: 0.62 },
  group_photo: { x: 0.7, y: 0.55 },
};

const HOTSPOT_SIZE = 44;
const CALLOUT_WIDTH = 210;

/** 热点锚点：中心对齐媒体区域的固定比例位置（StyleProp，热点位置逐物固定） */
function hotspotAnchorStyle(spot: { x: number; y: number }) {
  return {
    position: 'absolute' as const,
    left: `${spot.x * 100}%` as `${number}%`,
    top: `${spot.y * 100}%` as `${number}%`,
    width: HOTSPOT_SIZE,
    height: HOTSPOT_SIZE,
    marginLeft: -HOTSPOT_SIZE / 2,
    marginTop: -HOTSPOT_SIZE / 2,
  };
}

export function RoomScreen() {
  const focus = useFocus();
  const { t } = useTranslation('achievements');
  const { back } = useApp();
  const { width: windowWidth } = useWindowDimensions();
  // 同一时间只开一个 callout；再次点击同一热点收起
  const [openItemId, setOpenItemId] = useState<RoomItemId | null>(null);

  // 音乐门控：自习室与专注画面共用「画面在场」白名单（首页/成就/我的恒静默）
  useFocusEffect(
    useCallback(() => {
      getMusicController().setScreenActive(true);
      return () => getMusicController().setScreenActive(false);
    }, []),
  );

  const unlockedItems = focus.roomItems.filter(
    (item, index, all) => all.findIndex((other) => other.itemId === item.itemId) === index,
  );

  return (
    <View style={styles.screen}>
      {/* 房间媒体：顶部至约 66% */}
      <View style={styles.media}>
        <ImmersiveMediaSurface
          manifest={focus.skin}
          state="ready"
          reducedMotion={focus.reducedMotion}
          style={StyleSheet.absoluteFill}
        />

        {unlockedItems.map((item) => {
          const spot = HOTSPOTS[item.itemId];
          if (!spot) return null;
          const open = openItemId === item.itemId;
          const def = ACHIEVEMENT_DEFS.find((candidate) => candidate.rewardItemId === item.itemId);
          // callout 中心夹在媒体 30%–70%，避免面板被屏幕边缘裁切
          const calloutOffset = Math.round(
            (Math.min(0.7, Math.max(0.3, spot.x)) - spot.x) * windowWidth,
          );
          return (
            <View key={item.itemId} pointerEvents="box-none" style={hotspotAnchorStyle(spot)}>
              {/* callout：surfaceRaised、圆角 12、caption；上下避让热点 */}
              {open ? (
                <View
                  style={[
                    styles.callout,
                    { marginLeft: -CALLOUT_WIDTH / 2 + calloutOffset },
                    spot.y < 0.5 ? styles.calloutBelow : styles.calloutAbove,
                  ]}
                  accessibilityRole="text"
                  accessibilityLabel={`${t(`item.${item.itemId}`)}，${t('calloutSource', { name: def ? t(`rule.${def.ruleKey}.name`) : '' })}`}
                >
                  <Text style={styles.calloutName} numberOfLines={1}>
                    {t(`item.${item.itemId}`)}
                  </Text>
                  <Text style={styles.calloutSource} numberOfLines={1}>
                    {t('calloutSource', { name: def ? t(`rule.${def.ruleKey}.name`) : '' })}
                  </Text>
                </View>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t(`item.${item.itemId}`)}
                accessibilityState={{ selected: open }}
                onPress={() => setOpenItemId(open ? null : item.itemId)}
                style={styles.hotspot}
              />
            </View>
          );
        })}
      </View>

      {/* 底部：说明 + 布置房间（P0-B） */}
      <View style={styles.bottom}>
        <Text style={styles.bottomTitle}>{t('roomTitle')}</Text>
        <Text style={styles.bottomCaption}>{t('roomCaption')}</Text>
        <View style={styles.arrangeRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('arrangeAction')}
            disabled
            accessibilityState={{ disabled: true }}
            style={styles.arrangeButton}
          >
            <Text style={styles.arrangeButtonText}>{t('arrangeAction')}</Text>
          </Pressable>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{t('arrangeComingSoon')}</Text>
          </View>
        </View>
      </View>

      {/* 返回：悬浮于媒体左上（44×44，媒体控件底） */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('backLabel')}
        onPress={back}
        style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
      >
        <AppIcon name="arrow-left" color={semantic.textPrimary} size={22} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semantic.canvas,
  },
  media: {
    height: '66%',
    overflow: 'hidden',
    backgroundColor: semantic.surfaceInset,
  },
  hotspot: {
    width: HOTSPOT_SIZE,
    height: HOTSPOT_SIZE,
    borderRadius: radii.round,
  },
  callout: {
    position: 'absolute',
    left: '50%',
    width: CALLOUT_WIDTH,
    borderRadius: radii.control,
    backgroundColor: semantic.surfaceRaised,
    borderWidth: 1,
    borderColor: semantic.borderStandard,
    paddingHorizontal: space.x3,
    paddingVertical: space.x2,
    gap: 2,
  },
  calloutBelow: {
    top: HOTSPOT_SIZE + space.x2,
  },
  calloutAbove: {
    bottom: HOTSPOT_SIZE + space.x2,
  },
  calloutName: {
    ...type.label,
    color: semantic.textPrimary,
  },
  calloutSource: {
    ...type.caption,
    color: semantic.textSecondary,
  },
  bottom: {
    flex: 1,
    paddingHorizontal: space.x4,
    paddingTop: space.x6,
    paddingBottom: space.x3,
    gap: space.x1,
  },
  bottomTitle: {
    ...type.title3,
    color: semantic.textPrimary,
  },
  bottomCaption: {
    ...type.body,
    color: semantic.textSecondary,
  },
  arrangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x3,
    marginTop: space.x4,
  },
  arrangeButton: {
    minHeight: 48,
    paddingHorizontal: space.x4,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: semantic.borderStandard,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.45, // doc-07 §7.3 禁用态保持可读
  },
  arrangeButtonText: {
    ...type.bodyStrong,
    color: semantic.textPrimary,
  },
  badge: {
    borderRadius: radii.round,
    borderWidth: 1,
    borderColor: semantic.borderStandard,
    paddingHorizontal: space.x2,
    paddingVertical: space.x1,
  },
  badgeText: {
    ...type.caption,
    color: semantic.textMuted,
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
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
});
