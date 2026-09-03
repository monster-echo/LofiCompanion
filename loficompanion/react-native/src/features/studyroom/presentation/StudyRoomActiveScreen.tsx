import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  BackHandler,
  Easing,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { AppIcon } from '../../../design-system/AppIcon';
import { useApp } from '../../../state/AppStore';
import { usePreferences } from '../../../preferences/PreferencesProvider';
import { radii, semantic, space, type, type ThemeColors } from '../../../theme/tokens';
import { useThemeStyles } from '../../../theme/useThemeStyles';
import { getMusicController } from '../../music/data/expoAudioMusicController';
import { telemetry } from '../../../telemetry/Telemetry';
import { skinPosterUrl } from '../../../data/apiClient';
import { useMusicLibrary } from '../../music/application/useMusicLibrary';
import { useFocus } from '../../focus/application/FocusStore';
import { useFocusQuickPrefs } from '../../focus/presentation/focusQuickPrefs';
import { ImmersiveMediaSurface } from '../../skins/presentation/ImmersiveMediaSurface';
import { DEFAULT_SKIN_MANIFEST, findSkinManifestByIdOrSlug } from '../../skins/domain/registry';
import { SheetOverlay } from '../../focus/presentation/SheetOverlay';
import { useStudyRoom, useStudyRoomState } from '../application/StudyRoomStore';
import { roomForId, roomName, type StudyRoomId } from '../domain/rooms';
import { DanmakuLayer, type DanmakuBand } from './DanmakuLayer';
import { DanmakuInputBar } from './DanmakuInputBar';

/**
 * S-自习室房间页（概念对齐 S04 专注中）：RN Modal 独立窗口层 100% 全屏，
 * 视频 + lofi 声音 + 弹幕只在进入房间后出现。左上「退出」+ 房间名 + 在线数；
 * 右上快捷设置（屏幕常亮 / 静音，与专注页共用 focusQuickPrefs）。
 * 挂载 5s 后进入沉浸弱化：控制件与输入条全部隐藏，任意触碰 160ms 恢复；
 * 读屏开启时不自动弱化。弹幕常显（是内容本身，不随 chrome 弱化）。
 */

const WEAKEN_AFTER_MS = 5000;
const RESTORE_MS = 160;
const WEAKEN_MS = 600;

/** 弹幕位置三档循环顺序（快捷设置点击切换） */
const BAND_CYCLE: readonly DanmakuBand[] = ['center', 'top', 'bottom'];
const BAND_LABEL_KEY: Record<DanmakuBand, 'danmakuBandCenter' | 'danmakuBandTop' | 'danmakuBandBottom'> = {
  top: 'danmakuBandTop',
  center: 'danmakuBandCenter',
  bottom: 'danmakuBandBottom',
};

export function StudyRoomActiveScreen() {
  const controller = useStudyRoom();
  const state = useStudyRoomState();
  const { back, showToast, signedIn, navigate } = useApp();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation('studyroom');
  const { locale, palette } = usePreferences();
  // sheet（快捷设置）是主题化 UI 层：内容令牌走主题（亮色暖纸白面板+暗字）；
  // 影像 chrome 仍用模块级 semantic 主题无关层
  const sheetStyles = useThemeStyles(makeSheetStyles);
  // 减少动态是无障碍全局偏好（FocusProvider 注入），房间页与专注页同源；
  // companion 状态机同源复用：人物随当前专注会话流转（专注中=伏案写字），
  // 硬编码 'ready' 会让人物永远保持待机（issue：自习室人物不写字）。
  const { reducedMotion, skins, companion } = useFocus();
  const { muted, setMuted, keepAwake, setKeepAwake } = useFocusQuickPrefs();
  useMusicLibrary(signedIn);

  const [quickMenu, setQuickMenu] = useState(false);
  const [screenReader, setScreenReader] = useState(false);
  const [weakened, setWeakened] = useState(false);
  const [danmakuBand, setDanmakuBand] = useState<DanmakuBand>('center');
  const chrome = useRef(new Animated.Value(1)).current;
  const weakenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 路由参数 roomId → 房间定义（未知 id 落回默认房间）；房间媒体从皮肤注册表
  // 解析。未购/未拉取的付费皮肤 manifest 不存在——此前静默回落雨夜书房会
  // 「进 Midnight 房间看到的却是雨夜素材」，现在改为公开海报 + 解锁引导。
  const roomId = (route.params as { roomId?: string } | undefined)?.roomId;
  const room = roomForId(roomId ?? '');
  const roomSkin = findSkinManifestByIdOrSlug(skins, room.id);
  const roomManifest = roomSkin ?? DEFAULT_SKIN_MANIFEST;
  const roomDisplayName = roomName(room, locale);

  // 进房 = 建连（弹幕/presence）+ 音乐在场（ambient：无需专注会话）；退出全部释放
  const enteredAt = useRef(0);
  useFocusEffect(
    useCallback(() => {
      controller.actions.enter((roomId ?? room.id) as StudyRoomId);
      const music = getMusicController();
      music.setScreenActive(true);
      music.setAmbientActive(true);
      enteredAt.current = Date.now();
      telemetry.track('studyroom_enter', { room_id: roomId ?? room.id });
      return () => {
        telemetry.track('studyroom_leave', {
          room_id: roomId ?? room.id,
          duration_ms: enteredAt.current ? Date.now() - enteredAt.current : 0,
        });
        music.setAmbientActive(false);
        music.setScreenActive(false);
        controller.actions.leave();
      };
      // room 身份由 roomId 决定，进房后不随渲染变化
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [controller, roomId]),
  );

  // ---- 弱化机制（对齐 FocusActiveScreen）----
  const scheduleWeaken = useCallback(() => {
    setWeakened(false);
    if (weakenTimer.current) clearTimeout(weakenTimer.current);
    weakenTimer.current = setTimeout(() => setWeakened(true), WEAKEN_AFTER_MS);
  }, []);
  const wake = useCallback(() => scheduleWeaken(), [scheduleWeaken]);

  useEffect(() => {
    scheduleWeaken();
    return () => {
      if (weakenTimer.current) clearTimeout(weakenTimer.current);
    };
  }, [scheduleWeaken]);

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isScreenReaderEnabled()
      .then((enabled) => {
        if (alive) setScreenReader(enabled);
      })
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    const target = weakened && !screenReader;
    Animated.timing(chrome, {
      toValue: target ? 0 : 1,
      duration: target ? WEAKEN_MS : RESTORE_MS,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [weakened, screenReader, chrome]);

  // Android 返回不退出房间：仅唤醒界面（退出走左上按钮，防误触断连）
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      wake();
      return true;
    });
    return () => sub.remove();
  }, [wake]);

  // ---- 屏幕常亮 / 静音（与专注页共用持久化偏好）----
  useEffect(() => {
    if (!keepAwake) return undefined;
    activateKeepAwakeAsync('studyroom-active').catch(() => undefined);
    return () => {
      void deactivateKeepAwake('studyroom-active');
    };
  }, [keepAwake]);

  useEffect(() => {
    getMusicController().setMuted(muted);
  }, [muted]);

  // 服务端 reject 的即时反馈（按 at 去重）
  const lastReject = state.lastReject;
  const consumedRejectAt = useRef(0);
  useEffect(() => {
    if (!lastReject || lastReject.at === consumedRejectAt.current) return;
    consumedRejectAt.current = lastReject.at;
    const message =
      lastReject.reason === 'blocked'
        ? t('rejectedBlocked')
        : lastReject.reason === 'too_long'
          ? t('rejectedTooLong')
          : lastReject.reason === 'cooldown'
            ? t('cooldownHint', { s: lastReject.retryAfterSeconds ?? 3 })
            : t('sendFailed');
    showToast(message, 'info');
  }, [lastReject, showToast]);

  const offline = state.status === 'connecting' || state.status === 'reconnecting';

  return (
    <Modal
      presentationStyle="fullScreen"
      // 双层模态（native-stack fullScreenModal 内再叠 RN Modal）下 fade 会在
      // 退出时瞬间移除独立窗口、露出底层 dismiss 动画的黑底——返回黑屏的
      // 根因。与 FocusActiveScreen 同解：内层不用动画（animationType="none"）。
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={wake}
    >
      <TouchableWithoutFeedback onPress={wake}>
        <View style={styles.screen}>
          <StatusBar hidden animated={false} />
          {roomSkin ? (
            <ImmersiveMediaSurface
              manifest={roomManifest}
              state={companion.playing ? companion.playing.state : companion.state}
              reducedMotion={reducedMotion}
              style={styles.mediaFill}
            />
          ) : (
            <>
              <Image
                source={{ uri: skinPosterUrl(room.id) }}
                style={styles.mediaFill}
                resizeMode="cover"
                blurRadius={2}
              />
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={t('themeLockedCta')}
                onPress={() => navigate('store.skinDetail', { skinSlug: room.id })}
                style={styles.lockedPill}
              >
                <AppIcon name="lock" color={semantic.onMedia} size={14} />
                <Text style={styles.lockedPillText}>{t('themeLockedHint')}</Text>
              </Pressable>
            </>
          )}

          <DanmakuLayer reducedMotion={reducedMotion} band={danmakuBand} />

          {/* 左上：退出 + 房间名 + 在线数 */}
          <Animated.View style={[styles.topLeft, { top: insets.top + 8, opacity: chrome }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('exitRoom')}
              onPress={back}
              style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}
            >
              <AppIcon name="chevron-left" color={semantic.textPrimary} size={20} />
            </Pressable>
            <View style={styles.titleBlock}>
              <Text style={styles.roomName}>{roomDisplayName}</Text>
              <View style={styles.onlineRow}>
                <View style={styles.dot} />
                <Text style={styles.onlineText}>{t('onlineNow', { n: state.onlineCount })}</Text>
              </View>
            </View>
          </Animated.View>

          {/* 右上：快捷设置（屏幕常亮 / 静音，与专注页同款） */}
          <Animated.View style={[styles.topRight, { top: insets.top + 8, opacity: chrome }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('quickMenuLabel')}
              onPress={() => {
                wake();
                setQuickMenu(true);
              }}
              style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}
            >
              <AppIcon name="sliders" color={semantic.textPrimary} size={20} />
            </Pressable>
          </Animated.View>

          {quickMenu ? (
            <SheetOverlay
              onClose={() => setQuickMenu(false)}
              closeLabel={t('closeLabel')}
              reducedMotion={reducedMotion}
              anchor="top"
              topInset={insets.top}
            >
              <Text style={sheetStyles.menuTitle}>{t('quickMenuLabel')}</Text>
              <Pressable
                accessibilityRole="switch"
                accessibilityLabel={t('keepAwakeLabel')}
                accessibilityState={{ checked: keepAwake }}
                onPress={() => setKeepAwake(!keepAwake)}
                style={({ pressed }) => [sheetStyles.menuRow, pressed && styles.pressed]}
              >
                <AppIcon
                  name={keepAwake ? 'sun' : 'moon'}
                  color={keepAwake ? palette.actionFocus : palette.textSecondary}
                  size={18}
                />
                <Text style={sheetStyles.menuRowLabel}>{t('keepAwakeLabel')}</Text>
                <View style={[sheetStyles.menuStatePill, keepAwake && sheetStyles.menuStatePillOn]}>
                  <Text style={[sheetStyles.menuStateText, keepAwake && sheetStyles.menuStateTextOn]}>
                    {keepAwake ? t('onState') : t('offState')}
                  </Text>
                </View>
              </Pressable>
              <Pressable
                accessibilityRole="switch"
                accessibilityLabel={t('muteLabel')}
                accessibilityState={{ checked: muted }}
                onPress={() => setMuted(!muted)}
                style={({ pressed }) => [sheetStyles.menuRow, pressed && styles.pressed]}
              >
                <AppIcon
                  name={muted ? 'volume-off' : 'volume-on'}
                  color={muted ? palette.actionFocus : palette.textSecondary}
                  size={18}
                />
                <Text style={sheetStyles.menuRowLabel}>{t('muteLabel')}</Text>
                <View style={[sheetStyles.menuStatePill, muted && sheetStyles.menuStatePillOn]}>
                  <Text style={[sheetStyles.menuStateText, muted && sheetStyles.menuStateTextOn]}>
                    {muted ? t('onState') : t('offState')}
                  </Text>
                </View>
              </Pressable>
              {/* 弹幕位置三档循环：点击在中部/顶部/底部间切换（弹幕本身常显） */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('danmakuPositionLabel')}
                accessibilityValue={{ text: t(BAND_LABEL_KEY[danmakuBand]) }}
                onPress={() =>
                  setDanmakuBand(BAND_CYCLE[(BAND_CYCLE.indexOf(danmakuBand) + 1) % BAND_CYCLE.length])
                }
                style={({ pressed }) => [sheetStyles.menuRow, pressed && styles.pressed]}
              >
                <AppIcon name="palette" color={palette.textSecondary} size={18} />
                <Text style={sheetStyles.menuRowLabel}>{t('danmakuPositionLabel')}</Text>
                <View style={sheetStyles.menuStatePill}>
                  <Text style={sheetStyles.menuStateText}>{t(BAND_LABEL_KEY[danmakuBand])}</Text>
                </View>
              </Pressable>
            </SheetOverlay>
          ) : null}

          {/* 连接状态：常显（不随弱化隐藏，弱化时也让人知道还没连上） */}
          {offline ? (
            <View style={[styles.statusChip, { top: insets.top + 68 }]} pointerEvents="none">
              <Text style={styles.statusText}>
                {state.status === 'connecting' ? t('connecting') : t('reconnecting')}
              </Text>
            </View>
          ) : null}

          {/* 输入条随 chrome 弱化/恢复（点击屏幕浮现，5s 无操作隐去） */}
          <DanmakuInputBar chromeOpacity={chrome} />
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semantic.canvasDeep,
  },
  mediaFill: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  topLeft: {
    position: 'absolute',
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x2,
  },
  titleBlock: {
    gap: 2,
  },
  roomName: {
    ...type.title3,
    color: semantic.textPrimary,
    textShadowColor: 'rgba(6,16,28,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 12,
  },
  onlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radii.round,
    backgroundColor: semantic.success,
  },
  onlineText: {
    ...type.caption,
    color: semantic.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  topRight: {
    position: 'absolute',
    right: 12,
  },
  roundButton: {
    width: 44,
    height: 44,
    borderRadius: radii.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(13,27,43,0.5)',
    borderWidth: 1,
    borderColor: semantic.borderSoft,
  },
  statusChip: {
    position: 'absolute',
    alignSelf: 'center',
    borderRadius: radii.round,
    backgroundColor: 'rgba(13,27,43,0.5)',
    paddingHorizontal: space.x3,
    paddingVertical: space.x1,
  },
  statusText: {
    ...type.caption,
    color: semantic.textSecondary,
  },
  // 快捷设置二级菜单样式已拆到 makeSheetStyles（主题化 UI 层，随亮暗翻转）
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
  // 未解锁主题的海报兜底态：中央引导 pill（压在固定暗色媒体层上，用 onMedia）
  lockedPill: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 120,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x1,
    borderRadius: radii.round,
    backgroundColor: 'rgba(13,27,43,0.62)',
    borderWidth: 1,
    borderColor: semantic.borderEmphasis,
    paddingHorizontal: space.x3,
    paddingVertical: space.x2,
  },
  lockedPillText: {
    ...type.label,
    color: semantic.onMedia,
  },
});

/** 快捷设置 sheet 是 SheetOverlay 的主题化 UI 层：面板与内容令牌都随亮暗翻转
 *  （亮=暖纸白面板+深字）。原内容用模块级 semantic.* 固定暗值 → 亮色下浅字
 *  压浅底不可读、暗玻璃行糊在亮面板上（3.3 修复）。影像 chrome（房间名/在线
 *  数/右上入口）仍属 semantic 主题无关覆盖层。 */
const makeSheetStyles = (p: ThemeColors) => StyleSheet.create({
  menuTitle: {
    ...type.title3,
    color: p.textPrimary,
    textAlign: 'center',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x3,
    minHeight: 52,
    marginTop: space.x2,
    borderRadius: radii.control,
    paddingHorizontal: space.x3,
    backgroundColor: p.surfaceInset,
    borderWidth: 1,
    borderColor: p.borderSoft,
  },
  menuRowLabel: {
    ...type.bodyStrong,
    color: p.textPrimary,
    flex: 1,
  },
  menuStatePill: {
    borderRadius: radii.round,
    backgroundColor: p.surfaceRaised,
    paddingHorizontal: space.x3,
    paddingVertical: 4,
  },
  menuStatePillOn: {
    backgroundColor: 'rgba(99,191,148,0.16)',
  },
  menuStateText: {
    ...type.micro,
    color: p.textSecondary,
  },
  menuStateTextOn: {
    color: p.success,
  },
});
