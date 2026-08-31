import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useApp } from '../../../state/AppStore';
import { useFocus } from '../../focus/application/FocusStore';
import { ImmersiveMediaSurface } from '../../skins/presentation/ImmersiveMediaSurface';
import { AppIcon } from '../../../design-system/AppIcon';
import { mediaControl } from '../../../design-system/derivedTokens';
import { radii, semantic, space, type } from '../../../theme/tokens';
import { useStudyRoom, useStudyRoomState } from '../application/StudyRoomStore';
import { defaultRoomId, roomForId } from '../domain/rooms';
import { DanmakuLayer } from './DanmakuLayer';
import { DanmakuInputBar } from './DanmakuInputBar';
import { RoomSwitcherSheet } from './RoomSwitcherSheet';
import { STUDY_ROOM_STRINGS as STR } from './strings';

/**
 * S-自习室 Tab 根页：共享 lofi 画面（内置皮肤 ready 态媒体）+ 弹幕 +
 * 在线人数，类似 YouTube lofi 直播间。连接生命周期由 useFocusEffect 驱动
 * （原生 Tab 保活：focus=enter 建连、blur=leave 断开省电）；视频沿用
 * 全局静音约定，音乐继续走全局音乐系统。
 */
export function StudyRoomScreen() {
  const controller = useStudyRoom();
  const state = useStudyRoomState();
  const { showToast } = useApp();
  const { reducedMotion } = useFocus();
  const insets = useSafeAreaInsets();
  const [switcherOpen, setSwitcherOpen] = useState(false);

  // Tab 聚焦即进入（复用上次房间）；离开断连并释放常亮
  useFocusEffect(
    useCallback(() => {
      controller.actions.enter();
      activateKeepAwakeAsync('studyroom').catch(() => undefined);
      return () => {
        controller.actions.leave();
        deactivateKeepAwake('studyroom');
      };
      // controller 身份稳定
    }, [controller]),
  );

  // 服务端 reject 的即时反馈（按 at 去重，避免重复弹）
  const lastReject = state.lastReject;
  const consumedRejectAt = useRef(0);
  useEffect(() => {
    if (!lastReject || lastReject.at === consumedRejectAt.current) return;
    consumedRejectAt.current = lastReject.at;
    const message =
      lastReject.reason === 'blocked'
        ? STR.rejectedBlocked
        : lastReject.reason === 'too_long'
          ? STR.rejectedTooLong
          : lastReject.reason === 'cooldown'
            ? STR.cooldownHint(lastReject.retryAfterSeconds ?? 3)
            : STR.sendFailed;
    showToast(message, 'info');
  }, [lastReject, showToast]);

  const room = roomForId(state.roomId ?? defaultRoomId());
  const offline = state.status === 'connecting' || state.status === 'reconnecting';

  return (
    <View style={styles.screen}>
      <ImmersiveMediaSurface
        manifest={room.manifest}
        state="ready"
        reducedMotion={reducedMotion}
        style={StyleSheet.absoluteFill}
      />

      <DanmakuLayer reducedMotion={reducedMotion} />

      {/* 顶栏：房间名 + 在线数 + 换房入口 */}
      <View
        style={[styles.topBar, { top: insets.top + space.x3 }]}
        pointerEvents="box-none"
      >
        <View style={styles.titlePill}>
          <Text style={styles.titleText}>{room.name}</Text>
        </View>
        <View style={styles.titlePill}>
          <View style={styles.dot} />
          <Text style={styles.onlineText}>{STR.onlineNow(state.onlineCount)}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={STR.switchRoom}
          onPress={() => setSwitcherOpen(true)}
          style={({ pressed }) => [styles.switchButton, pressed && styles.pressed]}
        >
          <AppIcon name="group" color={semantic.textPrimary} size={20} />
        </Pressable>
      </View>

      {/* 连接状态：非 open 时温和提示（不阻塞看视频） */}
      {offline ? (
        <View style={[styles.statusChip, { top: insets.top + 64 }]} pointerEvents="none">
          <Text style={styles.statusText}>
            {state.status === 'connecting' ? STR.connecting : STR.reconnecting}
          </Text>
        </View>
      ) : null}

      <DanmakuInputBar />

      <RoomSwitcherSheet visible={switcherOpen} onClose={() => setSwitcherOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semantic.canvasDeep,
  },
  topBar: {
    position: 'absolute',
    left: space.x4,
    right: space.x4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x2,
  },
  titlePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x1,
    borderRadius: radii.round,
    backgroundColor: mediaControl,
    paddingHorizontal: space.x3,
    paddingVertical: space.x2,
  },
  titleText: {
    ...type.bodyStrong,
    color: semantic.textPrimary,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: semantic.success,
  },
  onlineText: {
    ...type.caption,
    color: semantic.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  switchButton: {
    width: 44,
    height: 44,
    borderRadius: radii.round,
    backgroundColor: mediaControl,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 'auto',
  },
  statusChip: {
    position: 'absolute',
    alignSelf: 'center',
    borderRadius: radii.round,
    backgroundColor: mediaControl,
    paddingHorizontal: space.x3,
    paddingVertical: space.x1,
  },
  statusText: {
    ...type.caption,
    color: semantic.textSecondary,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
});
