import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  BackHandler,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { AppIcon } from "../../../design-system/AppIcon";
import { replaceRoute } from "../../../navigation/navigationRef";
import { useApp } from "../../../state/AppStore";
import { fonts } from "../../../design-system/fonts";
import { radii, semantic, space, type } from "../../../theme/tokens";
import { useFocus } from "../application/FocusStore";
import { effectiveSeconds as computeEffective } from "../domain/engine";
import { formatTimerSeconds } from "../../../design-system/FocusTimerRing";
import { ImmersiveMediaSurface } from "../../skins/presentation/ImmersiveMediaSurface";
import { SheetOverlay } from "./SheetOverlay";
import { ACTIVITY_STATUS, FOCUS_STRINGS as STR } from "./strings";
import { useFocusQuickPrefs } from "./focusQuickPrefs";
import { useMusicLibrary } from "../../music/application/useMusicLibrary";
import type { IconName } from "../../../design-system/AppIcon";

/**
 * S04 专注中（概念图 app-concept.png）：内容承载于 RN Modal 独立窗口层，
 * 陪伴内容从状态栏顶铺到 Home 指示条底（100% 全屏，不受 App.tsx 全局
 * SafeAreaView 垫充影响）；左上主题名 + 陪伴状态，右上入口：快捷设置
 * （二级菜单：屏幕常亮 / 静音）与调节主题；时钟大数字居中下，其下暂停/
 * 结束胶囊。挂载 5s 后
 * 进入沉浸弱化：除时钟外全部控制件完全隐藏，任意触碰 160ms 恢复；读屏
 * 开启时不自动弱化。1s interval 驱动 tick；到点自动 complete 并原位替换
 * 为完成页。
 */

/** 弱化：开始 5s 后触发；恢复 160ms；弱化淡入 600ms（doc-07 §10 只规范恢复值）。
 *  弱化语义为「只留时钟」：全部控制件完全隐藏（透明度 0），时钟常显。 */
const WEAKEN_AFTER_MS = 5000;
const RESTORE_MS = 160;
const WEAKEN_MS = 600;
const CHROME_OPACITY = 0;
/** 悬浮 Tab + 底部安全区的兜底高度（insets 未透传平台用） */
const FLOATING_TAB_FLOOR = 92;

export function FocusActiveScreen() {
  const focus = useFocus();
  const { showToast, replace, signedIn } = useApp();
  const insets = useSafeAreaInsets();
  const [ending, setEnding] = useState(false);
  const [quickMenu, setQuickMenu] = useState(false);
  const [screenReader, setScreenReader] = useState(false);
  const [weakened, setWeakened] = useState(false);
  const { muted, setMuted, keepAwake, setKeepAwake } = useFocusQuickPrefs();
  const music = useMusicLibrary(signedIn);

  const chrome = useRef(new Animated.Value(1)).current;
  const weakenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completedRef = useRef(false);

  const session = focus.activeSession;
  const paused = session?.status === "paused";
  const mediaState = focus.companion.playing
    ? focus.companion.playing.state
    : focus.companion.state;

  // ---- 弱化机制 ----
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

  // ---- 屏幕常亮：专注期间防息屏（右上快捷区可关，卸载自动释放）----
  useEffect(() => {
    if (!keepAwake) return undefined;
    activateKeepAwakeAsync("focus-active").catch(() => undefined);
    return () => {
      void deactivateKeepAwake("focus-active");
    };
  }, [keepAwake]);

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isScreenReaderEnabled()
      .then((enabled) => {
        if (alive) setScreenReader(enabled);
      })
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener(
      "screenReaderChanged",
      setScreenReader,
    );
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    const target = weakened && !screenReader;
    Animated.timing(chrome, {
      toValue: target ? CHROME_OPACITY : 1,
      duration: target ? WEAKEN_MS : RESTORE_MS,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [weakened, screenReader, chrome]);

  // Android 返回不退出专注：仅唤醒界面
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      wake();
      return true;
    });
    return () => sub.remove();
  }, [wake]);

  // ---- 静音开关 → 音乐控制器（挂载即同步一次，兜住会话恢复场景）----
  useEffect(() => {
    focus.actions.setMusicMuted(muted);
  }, [muted, focus.actions]);

  // ---- 1s 计时驱动 ----
  const tick = focus.actions.tick;
  useEffect(() => {
    const id = setInterval(() => tick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [tick]);

  // ---- 完成：到点结算并原位替换为完成页 ----
  useEffect(() => {
    if (!session || session.status !== "active") return;
    if (focus.remainingSeconds > 0 || completedRef.current) return;
    completedRef.current = true;
    focus.actions.complete(Date.now());
    replaceRoute("focus.complete");
  }, [session, focus.remainingSeconds, focus.actions]);

  if (!session) {
    // complete/abandon 已提交、替换导航进行中的一帧空壳
    return <View style={styles.screen} />;
  }

  const items: readonly {
    key: "pause" | "end";
    icon: IconName;
    label: string;
    onPress: () => void;
    disabled?: boolean;
  }[] = [
    paused
      ? {
          key: "pause",
          icon: "play",
          label: STR.resumeAction,
          onPress: () => {
            wake();
            focus.actions.resume(Date.now());
          },
        }
      : {
          key: "pause",
          icon: "pause",
          label: STR.pauseAction,
          onPress: () => {
            wake();
            focus.actions.pause(Date.now());
          },
        },
    {
      key: "end",
      icon: "stop",
      label: STR.endAction,
      disabled: ending, // doc-08 §5 ending：结束禁用，确认 sheet 出现
      onPress: () => {
        wake();
        setEnding(true);
      },
    },
  ];

  const confirmEnd = () => {
    const keptMinutes = Math.round(computeEffective(session, Date.now()) / 60);
    setEnding(false);
    focus.actions.abandon(Date.now());
    showToast(
      keptMinutes > 0 ? STR.keptMinutes(keptMinutes) : STR.keptNothing,
      "info",
    );
    replace("home");
  };

  // RN Modal 独立原生窗口层：内容天然从状态栏铺到 Home 指示条（100% 全屏），
  // 不受 App.tsx 全局 SafeAreaView 垫充与祖先视图裁切影响；translucent 两项
  // 让 Android 边到边覆盖系统栏区域。insets 仍来自外层 Provider，用于控件定位。
  return (
    <Modal
      presentationStyle="fullScreen"
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={wake}
    >
      <TouchableWithoutFeedback onPress={wake}>
        <View style={styles.screen}>
          {/* 沉浸专注：隐藏系统状态栏，卸载时由 PreferencesProvider 恢复 light */}
          <StatusBar hidden animated={false} />
          {/* 陪伴内容铺满整屏：Modal 内无垫充，直接绝对定位全填充 */}
          <ImmersiveMediaSurface
            manifest={focus.skin}
            state={mediaState}
            reducedMotion={focus.reducedMotion}
            style={styles.mediaFill}
          />

          {/* 左上：主题名 + 陪伴状态（概念图） */}
          <Animated.View
            style={[
              styles.skinBadge,
              { top: insets.top + 14, opacity: chrome },
            ]}
          >
            <Text style={styles.skinName}>{focus.skin.name}</Text>
            <View style={styles.statusRow}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>
                {ACTIVITY_STATUS[session.activity]}
              </Text>
            </View>
          </Animated.View>

          {/* 右上入口：快捷设置（二级菜单：屏幕常亮 / 静音）+ 调节主题 */}
          <Animated.View
            style={[
              styles.quickBarWrap,
              { top: insets.top + 8, opacity: chrome },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={STR.quickMenuLabel}
              onPress={() => {
                wake();
                setQuickMenu(true);
              }}
              style={({ pressed }) => [
                styles.tuneButton,
                pressed && styles.pressed,
              ]}
            >
              <AppIcon name="sliders" color={semantic.textPrimary} size={20} />
            </Pressable>
          </Animated.View>

          {/* 快捷设置二级菜单：常亮/静音开关行，点行切换（静音为预置，音频落地后生效）。
              入口在右上，菜单下拉锚定顶部（不遮时钟） */}
          {quickMenu ? (
            <SheetOverlay
              onClose={() => setQuickMenu(false)}
              closeLabel={STR.quickMenuLabel}
              reducedMotion={focus.reducedMotion}
              anchor="top"
              topInset={insets.top}
            >
              <Text style={styles.menuTitle}>{STR.quickMenuLabel}</Text>
              <Pressable
                accessibilityRole="switch"
                accessibilityLabel={STR.keepAwakeLabel}
                accessibilityState={{ checked: keepAwake }}
                onPress={() => setKeepAwake(!keepAwake)}
                style={({ pressed }) => [
                  styles.menuRow,
                  pressed && styles.pressed,
                ]}
              >
                <AppIcon
                  name={keepAwake ? "sun" : "moon"}
                  color={
                    keepAwake ? semantic.actionFocus : semantic.textSecondary
                  }
                  size={18}
                />
                <Text style={styles.menuRowLabel}>{STR.keepAwakeLabel}</Text>
                <View
                  style={[
                    styles.menuStatePill,
                    keepAwake && styles.menuStatePillOn,
                  ]}
                >
                  <Text
                    style={[
                      styles.menuStateText,
                      keepAwake && styles.menuStateTextOn,
                    ]}
                  >
                    {keepAwake ? STR.onState : STR.offState}
                  </Text>
                </View>
              </Pressable>
              <Pressable
                accessibilityRole="switch"
                accessibilityLabel={STR.muteLabel}
                accessibilityState={{ checked: muted }}
                onPress={() => setMuted(!muted)}
                style={({ pressed }) => [
                  styles.menuRow,
                  pressed && styles.pressed,
                ]}
              >
                <AppIcon
                  name={muted ? "volume-off" : "volume-on"}
                  color={muted ? semantic.actionFocus : semantic.textSecondary}
                  size={18}
                />
                <Text style={styles.menuRowLabel}>{STR.muteLabel}</Text>
                <View
                  style={[
                    styles.menuStatePill,
                    muted && styles.menuStatePillOn,
                  ]}
                >
                  <Text
                    style={[
                      styles.menuStateText,
                      muted && styles.menuStateTextOn,
                    ]}
                  >
                    {muted ? STR.onState : STR.offState}
                  </Text>
                </View>
              </Pressable>
            </SheetOverlay>
          ) : null}

          {/* 事件提醒由陪伴画面承担（播放器切入事件态海报/视频，播完自动回归），
              不再叠加文字横幅——保持沉浸画面无打断（doc-08 §6） */}

          {/* 中下：时钟大数字 → 暂停/结束胶囊（概念图布局） */}
          <Animated.View
            style={[
              styles.bottomStack,
              {
                bottom: Math.max(insets.bottom + space.x5, FLOATING_TAB_FLOOR),
              },
            ]}
          >
            {/* 时钟常显：弱化态下唯一的保留元素（「已暂停」提示随时钟一并保留） */}
            <View style={{ alignItems: "center" }}>
              <Text
                style={styles.timerText}
                accessibilityRole="text"
                accessibilityLabel={`剩余 ${formatTimerSeconds(focus.remainingSeconds)}`}
              >
                {formatTimerSeconds(focus.remainingSeconds)}
              </Text>
              {paused ? (
                <Text style={styles.pausedHint}>{STR.paused}</Text>
              ) : null}
            </View>

            <Animated.View style={{ opacity: chrome, alignItems: "center" }}>
              {/* 正在播字幕：静音时隐藏（弱化态随 chrome 一并隐去，只留时钟） */}
              {!muted && music.selectedTrack ? (
                <Text style={styles.nowPlayingText}>
                  {STR.nowPlaying(music.selectedTrack.title)}
                </Text>
              ) : null}
              <View style={styles.pillRow}>
                {items.map((item) => (
                  <Pressable
                    key={item.key}
                    accessibilityRole="button"
                    accessibilityLabel={item.label}
                    disabled={item.disabled}
                    onPress={item.onPress}
                    style={({ pressed }) => [
                      styles.pill,
                      item.disabled && styles.pillDisabled,
                      pressed && !item.disabled && styles.pressed,
                    ]}
                  >
                    <AppIcon
                      name={item.icon}
                      color={semantic.textPrimary}
                      size={18}
                    />
                    <Text style={styles.pillText}>{item.label}</Text>
                  </Pressable>
                ))}
              </View>
            </Animated.View>
          </Animated.View>

          {/* 结束二次确认 sheet（Modal 内无 SafeAreaView 垫充：补底部安全区） */}
          {ending ? (
            <SheetOverlay
              onClose={() => setEnding(false)}
              closeLabel={STR.endConfirmStay}
              reducedMotion={focus.reducedMotion}
              bottomInset={insets.bottom}
            >
              <Text style={styles.confirmTitle}>{STR.endConfirmTitle}</Text>
              <Text style={styles.confirmMessage}>
                {Math.round(computeEffective(session, Date.now()) / 60) > 0
                  ? STR.endConfirmKept(
                      Math.round(computeEffective(session, Date.now()) / 60),
                    )
                  : STR.endConfirmKeptZero}
              </Text>
              <View style={styles.confirmActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={STR.endConfirmStay}
                  onPress={() => setEnding(false)}
                  style={({ pressed }) => [
                    styles.confirmSecondary,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.confirmSecondaryText}>
                    {STR.endConfirmStay}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={STR.endConfirmLeave}
                  onPress={confirmEnd}
                  style={({ pressed }) => [
                    styles.confirmDanger,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.confirmDangerText}>
                    {STR.endConfirmLeave}
                  </Text>
                </Pressable>
              </View>
            </SheetOverlay>
          ) : null}
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
    // Modal 内无 SafeAreaView 垫充：从状态栏顶到 Home 指示条底 100% 填充
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  skinBadge: {
    position: "absolute",
    left: 20,
    alignItems: "flex-start",
    gap: 2,
  },
  skinName: {
    ...type.title3,
    color: semantic.textPrimary,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: radii.round,
    backgroundColor: semantic.success,
  },
  statusText: {
    ...type.caption,
    color: semantic.textSecondary,
  },
  quickBarWrap: {
    position: "absolute",
    right: 12,
    flexDirection: "row",
    gap: space.x2,
  },
  tuneButton: {
    width: 44,
    height: 44,
    borderRadius: radii.round,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(13,27,43,0.5)",
    borderWidth: 1,
    borderColor: semantic.borderSoft,
  },
  // 快捷设置二级菜单：行 = 图标 + 标签 + 状态胶囊（开启态 success 着色）
  menuTitle: {
    ...type.title3,
    color: semantic.textPrimary,
    textAlign: "center",
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.x3,
    minHeight: 52,
    marginTop: space.x2,
    borderRadius: radii.control,
    paddingHorizontal: space.x3,
    backgroundColor: "rgba(13,27,43,0.5)",
    borderWidth: 1,
    borderColor: semantic.borderSoft,
  },
  menuRowLabel: {
    ...type.bodyStrong,
    color: semantic.textPrimary,
    flex: 1,
  },
  menuStatePill: {
    borderRadius: radii.round,
    backgroundColor: semantic.surfaceInset,
    paddingHorizontal: space.x3,
    paddingVertical: 4,
  },
  menuStatePillOn: {
    // success 柔和底（对齐 tokens warningSoft 的 0.16 透明度惯例）
    backgroundColor: "rgba(99,191,148,0.16)",
  },
  menuStateText: {
    ...type.micro,
    color: semantic.textSecondary,
  },
  menuStateTextOn: {
    color: semantic.success,
  },
  bottomStack: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    gap: space.x5,
  },
  timerText: {
    fontFamily: fonts.serif,
    fontSize: 76,
    lineHeight: 88,
    fontWeight: "600",
    color: semantic.textPrimary,
    fontVariant: ["tabular-nums"],
    letterSpacing: 2,
    textShadowColor: "rgba(6,16,28,0.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 12,
  },
  pausedHint: {
    ...type.caption,
    color: semantic.textSecondary,
    marginTop: space.x1,
  },
  pillRow: {
    flexDirection: "row",
    gap: space.x3,
  },
  nowPlayingText: {
    ...type.caption,
    color: semantic.textSecondary,
    marginBottom: space.x3,
  },
  pill: {
    minHeight: 52,
    borderRadius: radii.round,
    paddingHorizontal: space.x6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.x2,
    backgroundColor: "rgba(13,27,43,0.55)",
    borderWidth: 1,
    borderColor: semantic.borderSoft,
  },
  pillDisabled: {
    opacity: 0.5,
  },
  pillText: {
    ...type.bodyStrong,
    color: semantic.textPrimary,
  },
  confirmTitle: {
    ...type.title3,
    color: semantic.textPrimary,
    textAlign: "center",
  },
  confirmMessage: {
    ...type.body,
    color: semantic.textSecondary,
    textAlign: "center",
    marginTop: space.x2,
  },
  confirmActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.x3,
    marginTop: space.x5,
    marginBottom: space.x2,
  },
  confirmSecondary: {
    flex: 1,
    minHeight: 48,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: semantic.borderStandard,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.x4,
  },
  confirmSecondaryText: {
    ...type.bodyStrong,
    color: semantic.textSecondary,
  },
  confirmDanger: {
    flex: 1,
    minHeight: 52,
    borderRadius: radii.control,
    backgroundColor: semantic.danger,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.x5,
  },
  confirmDangerText: {
    ...type.bodyStrong,
    // 危险实底按钮前景恒白（与 AppButton onAction 语义一致）
    color: semantic.onAction,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
});
