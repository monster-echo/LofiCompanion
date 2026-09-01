import React, { useEffect } from 'react';
import {
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../../state/AppStore';
import { usePreferences } from '../../../preferences/PreferencesProvider';
import { AppIcon } from '../../../design-system/AppIcon';
import { radii, space, type, type ThemeColors } from '../../../theme/tokens';
import { useThemeStyles } from '../../../theme/useThemeStyles';
import { useAsyncRefresh } from '../../leaderboards/application/useAsyncRefresh';
import { stateAsset } from '../../skins/domain/resolve';
import { fetchRoomCounts } from '../data/roomsClient';
import { STUDY_ROOMS, roomName, type StudyRoomDef } from '../domain/rooms';
import { resolveStudyRoomWsUrl, studyRoomHttpBaseOf } from '../domain/wsUrl';

/**
 * S-自习室 Tab 根页：公开自习室列表（先选房、后进入）。房间 = 内置皮肤
 * 主题，海报即皮肤 ready 态；在线人数来自 WS 服务的内存态（GET /rooms，
 * 聚焦刷新 + 15s 轮询兜底，无需建连）。点卡片进入 studyroom.active
 * 全屏房间——视频与 lofi 声音只在房间内出现。
 */

const COUNTS_POLL_MS = 15_000;

export function StudyRoomScreen() {
  const { navigate } = useApp();
  const { locale, palette } = usePreferences();
  const styles = useThemeStyles(makeStyles);
  const { t } = useTranslation('studyroom');
  const insets = useSafeAreaInsets();
  const { state, refreshing, refresh } = useAsyncRefresh(() => fetchRoomCounts(httpBase()), []);

  useEffect(() => {
    const timer = setInterval(() => {
      void refresh();
    }, COUNTS_POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const countsUnavailable = state.status === 'error';
  const countFor = (room: StudyRoomDef): number | null => {
    if (state.status !== 'ready') return null;
    return state.data.find((row) => row.roomId === room.id)?.onlineCount ?? 0;
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space.x4, paddingBottom: insets.bottom + 120 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={palette.textSecondary}
          />
        }
      >
        <Text style={styles.title}>{t('roomTitle')}</Text>
        <Text style={styles.subtitle}>{t('listSubtitle')}</Text>
        {countsUnavailable ? <Text style={styles.countsHint}>{t('countsUnavailable')}</Text> : null}
        <View style={styles.cards}>
          {STUDY_ROOMS.map((room) => {
            const count = countFor(room);
            const name = roomName(room, locale);
            return (
              <Pressable
                key={room.id}
                accessibilityRole="button"
                accessibilityLabel={`${t('enterRoom', { name })}，${
                  count === null ? '' : t('onlineNow', { n: count })
                }`}
                onPress={() => navigate('studyroom.active', { roomId: room.id })}
                style={({ pressed }) => [styles.card, pressed && styles.pressed]}
              >
                <Image
                  source={stateAsset(room.manifest, 'ready').poster as number}
                  style={StyleSheet.absoluteFill}
                  resizeMode="cover"
                  blurRadius={2}
                />
                <View style={styles.cardScrim} />
                <View style={styles.cardBody}>
                  <Text style={styles.cardName}>{name}</Text>
                  <View style={styles.cardFooter}>
                    <View style={styles.onlineRow}>
                      <View style={styles.dot} />
                      <Text style={styles.onlineText}>
                        {count === null ? ' ' : t('onlineNow', { n: count })}
                      </Text>
                    </View>
                    <View style={styles.enterPill}>
                      <Text style={styles.enterText}>{t('enterRoom', { name })}</Text>
                      <AppIcon name="chevron-right" color={palette.textPrimary} size={14} />
                    </View>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

/** WS 地址 → 同源 HTTP 基地址（与 WS 共用 env 配置与开发缺省）。 */
function httpBase(): string {
  return studyRoomHttpBaseOf(
    resolveStudyRoomWsUrl({
      wsUrl: process.env.EXPO_PUBLIC_STUDYROOM_WS_URL,
      platformOS: Platform.OS,
      isDev: __DEV__,
    }),
  );
}

// RN 0.86 已移除 StyleSheet.absoluteFillObject，统一用显式填充（对齐 SheetOverlay）
const absoluteFill = {
  position: 'absolute' as const,
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
};

const makeStyles = (p: ThemeColors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: p.canvasDeep,
  },
  content: {
    paddingHorizontal: space.x4,
    gap: space.x2,
  },
  title: {
    ...type.title1,
    color: p.textPrimary,
  },
  subtitle: {
    ...type.body,
    color: p.textSecondary,
    marginBottom: space.x3,
  },
  countsHint: {
    ...type.caption,
    color: p.textMuted,
    marginBottom: space.x2,
  },
  cards: {
    gap: space.x4,
  },
  card: {
    height: 184,
    borderRadius: radii.card,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: p.borderSoft,
  },
  cardScrim: {
    ...absoluteFill,
    backgroundColor: 'rgba(6, 12, 22, 0.52)',
  },
  cardBody: {
    ...absoluteFill,
    padding: space.x5,
    justifyContent: 'space-between',
  },
  cardName: {
    ...type.title2,
    color: p.textPrimary,
    textShadowColor: 'rgba(6,16,28,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  onlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: p.success,
  },
  onlineText: {
    ...type.caption,
    color: p.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  enterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radii.round,
    backgroundColor: 'rgba(12, 14, 20, 0.55)',
    borderWidth: 1,
    borderColor: p.borderSoft,
    paddingHorizontal: space.x3,
    paddingVertical: space.x1,
  },
  enterText: {
    ...type.label,
    color: p.textPrimary,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
});
