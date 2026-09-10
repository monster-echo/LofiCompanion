import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  BackHandler,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useFocusEffect } from "@react-navigation/native";
import { AppIcon } from "../../../design-system/AppIcon";
import { mediaGlassControl, mediaTextShadow } from "../../../design-system/derivedTokens";
import { CompletionBurst } from "../../../design-system/CompletionBurst";
import { PressableScale } from "../../../design-system/PressableScale";
import { StudyResultSheet } from "../../../design-system/StudyResultSheet";
import { replaceRoute } from "../../../navigation/navigationRef";
import { useApp } from "../../../state/AppStore";
import { fonts } from "../../../design-system/fonts";
import { radii, semantic, space, type, type ThemeColors } from "../../../theme/tokens";
import { useThemeStyles } from "../../../theme/useThemeStyles";
import { useFocus } from "../application/FocusStore";
import { effectiveSeconds as computeEffective } from "../domain/engine";
import { formatTimerSeconds } from "../../../design-system/FocusTimerRing";
import { ImmersiveMediaSurface } from "../../skins/presentation/ImmersiveMediaSurface";
import { skinDisplayName } from "../../skins/domain/registry";
import { usePreferences } from "../../../preferences/PreferencesProvider";
import { SheetOverlay } from "./SheetOverlay";
import { useTranslation } from 'react-i18next';
import { useFocusQuickPrefs } from "./focusQuickPrefs";
import { useMusicLibrary } from "../../music/application/useMusicLibrary";
import { getMusicController } from "../../music/data/expoAudioMusicController";
import type { IconName } from "../../../design-system/AppIcon";
import { i18n } from "../../../i18n/core";

/**
 * S04 专注中（概念图 app-concept.png）：路由为 fullScreenModal，内容天然
 * 边到边（陪伴内容从状态栏顶铺到 Home 指示条底，无全局垫充）；左上主题名 +
 * 陪伴状态，右上入口：快捷设置
 * （二级菜单：屏幕常亮 / 静音）与调节主题；时钟大数字居中下，其下暂停/
 * 结束胶囊。挂载 5s 后
 * 进入沉浸弱化：除时钟外全部控制件完全隐藏，任意触碰 160ms 恢复；读屏
 * 开启时不自动弱化。1s interval 驱动 tick；到点自动 complete：全屏
 * completed 媒体庆祝停留后，结果 sheet 原位滑入（完成结算并入本屏，不跳页）。
 */

/** 弱化：开始 5s 后触发；恢复 160ms；弱化淡入 600ms（doc-07 §10 只规范恢复值）。
 *  弱化语义为「只留时钟」：全部控制件完全隐藏（透明度 0），时钟常显。 */
const WEAKEN_AFTER_MS = 5000;
const RESTORE_MS = 160;
const WEAKEN_MS = 600;
const CHROME_OPACITY = 0;
/** 用户意图事件（暂停/恢复/完成）的画面叠化时长：短于清单 500ms，更跟手 */
const FAST_CROSSFADE_MS = 260;
/** 完成庆祝停留：归零后让 completed 视频 + 绽放播够再滑入结果 sheet（reducedMotion 减半） */
const CELEBRATE_HOLD_MS = 1400;
const CELEBRATE_HOLD_REDUCED_MS = 600;
/** 结果标题入场：sheet 上滑前 200ms 自上 -8dp 沉降淡入（原 S06 编排） */
const TITLE_DELAY_MS = 200;
const TITLE_MS = 240;
const REDUCED_TITLE_MS = 100;
const TITLE_OFFSET = -8;
/** 开场编排：底部时钟上浮 + 徽章/快捷钮错峰淡入（与 sit-down 视频呼应的仪式感） */
const ENTER_STACK_MS = 320;
const ENTER_BADGE_MS = 250;
const ENTER_QUICK_MS = 250;
/** 暂停画面语言：暗角收拢 + 时钟呼吸（画面表达「暂停仍在场」，不弹横幅） */
const VIGNETTE_MS = 260;
const VIGNETTE_ON = 0.35;
const VIGNETTE_ON_REDUCED = 0.25;
const BREATH_MS = 1400;
const BREATH_TO = 0.75;
/** 悬浮 Tab + 底部安全区的兜底高度（insets 未透传平台用） */
const FLOATING_TAB_FLOOR = 92;

export function FocusActiveScreen() {
  const focus = useFocus();
  const { locale, palette } = usePreferences();
  // sheet（快捷设置/结束确认）是主题化 UI 层：内容令牌走主题（亮色暖纸白面板+暗字），
  // 影像 chrome 仍用模块级 semantic 主题无关层
  const sheetStyles = useThemeStyles(makeSheetStyles);
  const { t } = useTranslation('focus');
  const { showToast, back, signedIn, replace } = useApp();
  const insets = useSafeAreaInsets();
  const [ending, setEnding] = useState(false);
  const [quickMenu, setQuickMenu] = useState(false);
  const [screenReader, setScreenReader] = useState(false);
  const [weakened, setWeakened] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  // 结算覆盖层：庆祝停留结束后滑入结果 sheet（原 S06 完成页并入本屏）
  const [showResult, setShowResult] = useState(false);
  const { muted, setMuted, keepAwake, setKeepAwake } = useFocusQuickPrefs();
  const music = useMusicLibrary(signedIn);

  const chrome = useRef(new Animated.Value(1)).current;
  const weakenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const celebrateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completedRef = useRef(false);
  // 完成时钟脉冲：归零瞬间数字轻跳一次（独立于 chrome——脉冲先于控件隐去）
  const timerPulse = useRef(new Animated.Value(1)).current;
  // 开场编排值：bottomStack 上浮淡入 / 徽章与快捷钮错峰淡入（挂载一次性）
  const enterStack = useRef(new Animated.Value(0)).current;
  const enterBadge = useRef(new Animated.Value(0)).current;
  const enterQuick = useRef(new Animated.Value(0)).current;
  // 暂停暗角与时钟呼吸（画面语言；恢复即时清除）
  const vignette = useRef(new Animated.Value(0)).current;
  const breath = useRef(new Animated.Value(1)).current;
  // 结果标题入场（沉降淡入，与 sheet 上滑错峰）
  const titleIn = useRef(new Animated.Value(0)).current;

  // 音乐门控：lofi 仅在专注画面与自习室在场时出声（首页/成就/我的恒静默）；
  // 失焦/卸载即暂停，回焦续播。会话状态由 orchestrate 侧驱动，此处只报画面在场。
  useFocusEffect(
    useCallback(() => {
      getMusicController().setScreenActive(true);
      return () => getMusicController().setScreenActive(false);
    }, []),
  );

  const session = focus.activeSession;
  const paused = session?.status === "paused";
  // 结算模式：complete() 提交后 activeSession 为 null、completions 就位——
  // 全屏 completed 媒体保留在本屏，结果 sheet 覆盖其上（不再跳转完成页）
  const completion = focus.completions;
  const resultMode = !session && completion !== null;
  const mediaState = focus.companion.playing
    ? focus.companion.playing.state
    : focus.companion.state;
  // 用户意图事件的画面切换用短叠化（260ms）：点击到画面响应更跟手；
  // 系统切换（开始/喝水等）保持清单的 500ms。回归切换落在事件态持续期，
  // 同走短叠化——用户动作后的画面节奏统一偏快，符合体感。
  const playingEvent = focus.companion.playing?.eventType;
  const fastCrossfade =
    playingEvent === "focus.paused" ||
    playingEvent === "focus.resumed" ||
    playingEvent === "focus.completed";

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
    const target = (weakened && !screenReader) || celebrating;
    Animated.timing(chrome, {
      toValue: target ? CHROME_OPACITY : 1,
      // 庆祝收束走快淡（200ms）：只留纯媒体瞬间，弱化保持 600ms 惯例
      duration: celebrating ? 200 : target ? WEAKEN_MS : RESTORE_MS,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [weakened, screenReader, celebrating, chrome]);

  // 庆祝时钟脉冲：1→1.06→1（600ms），与光环绽放同刻；reducedMotion 跳过
  useEffect(() => {
    if (!celebrating || focus.reducedMotion) return;
    timerPulse.setValue(1);
    Animated.sequence([
      Animated.timing(timerPulse, {
        toValue: 1.06,
        duration: 300,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(timerPulse, {
        toValue: 1,
        duration: 300,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();
  }, [celebrating, focus.reducedMotion, timerPulse]);

  useEffect(() => {
    return () => {
      if (celebrateTimer.current) clearTimeout(celebrateTimer.current);
    };
  }, []);

  // Android 返回：会话中仅唤醒界面（退出走结束确认）；结算态=今天到此为止
  const finishToday = useCallback(() => {
    focus.actions.acknowledgeCompletions();
    replace('home');
  }, [focus.actions, replace]);
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (resultMode) {
        finishToday();
        return true;
      }
      wake();
      return true;
    });
    return () => sub.remove();
  }, [wake, resultMode, finishToday]);

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

  // ---- 开场编排（挂载一次性）：时钟上浮 → 徽章 → 快捷钮错峰入场 ----
  useEffect(() => {
    const [stack, badge, quick] = [enterStack, enterBadge, enterQuick];
    if (focus.reducedMotion) {
      stack.setValue(1);
      badge.setValue(1);
      quick.setValue(1);
      return;
    }
    stack.setValue(0);
    badge.setValue(0);
    quick.setValue(0);
    const fadeIn = (value: Animated.Value, delay: number, duration: number) =>
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(value, {
          toValue: 1,
          duration,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]);
    Animated.parallel([
      // 时钟栈：上浮 24dp + 淡入（位移由同一值插值，见 enterStackY）
      Animated.sequence([
        Animated.delay(60),
        Animated.timing(stack, {
          toValue: 1,
          duration: ENTER_STACK_MS,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
      fadeIn(badge, 160, ENTER_BADGE_MS),
      fadeIn(quick, 240, ENTER_QUICK_MS),
    ]).start();
  }, [focus.reducedMotion, enterStack, enterBadge, enterQuick]);

  // ---- 暂停暗角：mediaGlass 轻罩收拢注意力；恢复即时舒展（reducedMotion 定值） ----
  useEffect(() => {
    if (focus.reducedMotion) {
      vignette.setValue(paused ? VIGNETTE_ON_REDUCED : 0);
      return;
    }
    Animated.timing(vignette, {
      toValue: paused ? VIGNETTE_ON : 0,
      duration: VIGNETTE_MS,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [paused, focus.reducedMotion, vignette]);

  // ---- 暂停时钟呼吸：opacity 1↔0.75 循环，恢复即停并复位 ----
  useEffect(() => {
    if (!paused || focus.reducedMotion) {
      breath.stopAnimation();
      breath.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, {
          toValue: BREATH_TO,
          duration: BREATH_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(breath, {
          toValue: 1,
          duration: BREATH_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [paused, focus.reducedMotion, breath]);

  // ---- 完成：到点结算，庆祝停留（completed 视频全程可见）后原位滑入结果 sheet ----
  useEffect(() => {
    if (!session || session.status !== "active") return;
    if (focus.remainingSeconds > 0 || completedRef.current) return;
    completedRef.current = true;
    focus.actions.complete(Date.now());
    // complete() 已同步把媒体切到 completed（单次动作视频完整播放）——
    // 停留片刻让仪式感播完，不再瞬时跳页打断
    setCelebrating(true);
    const hold = focus.reducedMotion ? CELEBRATE_HOLD_REDUCED_MS : CELEBRATE_HOLD_MS;
    celebrateTimer.current = setTimeout(() => setShowResult(true), hold);
  }, [session, focus.remainingSeconds, focus.actions, focus.reducedMotion]);

  // 结果标题入场：sheet 上滑前自上沉降淡入（原 S06 编排随页并入）
  useEffect(() => {
    if (!showResult || !completion) return;
    Animated.sequence([
      Animated.delay(focus.reducedMotion ? 0 : TITLE_DELAY_MS),
      Animated.timing(titleIn, {
        toValue: 1,
        duration: focus.reducedMotion ? REDUCED_TITLE_MS : TITLE_MS,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();
  }, [showResult, completion, focus.reducedMotion, titleIn]);

  if (!session && !resultMode) {
    // abandon 已提交、back() 弹模态进行中的一帧空壳
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
          label: t('resumeAction'),
          onPress: () => {
            wake();
            focus.actions.resume(Date.now());
          },
        }
      : {
          key: "pause",
          icon: "pause",
          label: t('pauseAction'),
          onPress: () => {
            wake();
            focus.actions.pause(Date.now());
          },
        },
    {
      key: "end",
      icon: "stop",
      label: t('endAction'),
      disabled: ending, // doc-08 §5 ending：结束禁用，确认 sheet 出现
      onPress: () => {
        wake();
        setEnding(true);
      },
    },
  ];

  const confirmEnd = () => {
    // 结束确认仅在会话中可达（结算覆盖层无结束入口）；session 为 null 的帧不响应
    if (!session) return;
    const keptMinutes = Math.round(computeEffective(session, Date.now()) / 60);
    setEnding(false);
    focus.actions.abandon(Date.now());
    showToast(
      keptMinutes > 0 ? t('keptMinutes', { n: keptMinutes }) : t('keptNothing'),
      "info",
    );
    // back 弹出模态回原地（不 replace('home')：其内部是 resetToRoutes 整栈
    // 重建，规模大且会触发 guard 重定向）；落地页由根逻辑/guard 决定
    back();
  };

  // 结算覆盖层内容（原 S06 完成页并入本屏）。（成就 Tab 隐藏期间不展示
  // 「新成就」庆祝：发放记账照常进行，恢复入口时改回读 completions.grants）
  const again = () => {
    focus.actions.acknowledgeCompletions();
    replaceRoute('focus.setup');
  };

  // 全屏由路由呈现层（fullScreenModal + 边到边）承担；TouchableWithoutFeedback
  // 需单子节点，故 TWF 内保留一层同款 screen View 承载全部沉浸内容
  return (
    <View style={styles.screen}>
      <TouchableWithoutFeedback onPress={wake}>
        <View style={styles.screen}>
          {/* 沉浸专注：隐藏系统状态栏，卸载时由 PreferencesProvider 恢复 light */}
          <StatusBar hidden animated={false} />
          {/* 陪伴内容铺满整屏：绝对定位全填充 */}
          <ImmersiveMediaSurface
            manifest={focus.skin}
            state={mediaState}
            reducedMotion={focus.reducedMotion}
            crossfadeMs={fastCrossfade ? FAST_CROSSFADE_MS : undefined}
            style={styles.mediaFill}
          />

          {/* 完成绽放：媒体之上、控件 chrome 之下（庆祝时 chrome 快速隐去只留画面） */}
          <CompletionBurst visible={celebrating} reducedMotion={focus.reducedMotion} />

          {/* 暂停暗角：媒体之上、控件之下——收拢注意力的画面语言，不参与弱化
              （暂停在场时暗角常驻是正确的表达）；pointerEvents none 不挡触摸 */}
          <Animated.View
            pointerEvents="none"
            style={[styles.mediaFill, styles.vignette, { opacity: vignette }]}
          />

          {/* 左上：主题名 + 陪伴状态（概念图）；外层开场淡入、内层弱化 chrome。
              结算态隐藏（会话已提交，画面让位给 completed 媒体 + 结果 sheet） */}
          {session ? (
            <Animated.View
              style={[styles.skinBadge, { top: insets.top + 14, opacity: enterBadge }]}
            >
              <Animated.View style={{ opacity: chrome }}>
                <Text style={styles.skinName}>{skinDisplayName(focus.skin, locale)}</Text>
                <View style={styles.statusRow}>
                  <View style={styles.statusDot} />
                  <Text style={styles.statusText}>
                    {t(`status.${session.activity}`)}
                  </Text>
                </View>
              </Animated.View>
            </Animated.View>
          ) : null}

          {/* 右上入口：快捷设置（二级菜单：屏幕常亮 / 静音）+ 调节主题；结算态隐藏 */}
          {session ? (
            <Animated.View
              style={[styles.quickBarWrap, { top: insets.top + 8, opacity: enterQuick }]}
            >
              <Animated.View style={{ opacity: chrome }}>
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel={t('quickMenuLabel')}
                  onPress={() => {
                    wake();
                    setQuickMenu(true);
                  }}
                  reducedMotion={focus.reducedMotion}
                  style={styles.tuneButton}
                >
                  <AppIcon name="sliders" color={semantic.textPrimary} size={20} />
                </PressableScale>
              </Animated.View>
            </Animated.View>
          ) : null}

          {/* 快捷设置二级菜单：常亮/静音开关行，点行切换（静音为预置，音频落地后生效）。
              入口在右上，菜单下拉锚定顶部（不遮时钟） */}
          {quickMenu ? (
            <SheetOverlay
              onClose={() => setQuickMenu(false)}
              closeLabel={t('quickMenuLabel')}
              reducedMotion={focus.reducedMotion}
              anchor="top"
              topInset={insets.top}
            >
              <Text style={sheetStyles.menuTitle}>{t('quickMenuLabel')}</Text>
              <Pressable
                accessibilityRole="switch"
                accessibilityLabel={t('keepAwakeLabel')}
                accessibilityState={{ checked: keepAwake }}
                onPress={() => setKeepAwake(!keepAwake)}
                style={({ pressed }) => [
                  sheetStyles.menuRow,
                  pressed && styles.pressed,
                ]}
              >
                <AppIcon
                  name={keepAwake ? "sun" : "moon"}
                  color={
                    keepAwake ? palette.actionFocus : palette.textSecondary
                  }
                  size={18}
                />
                <Text style={sheetStyles.menuRowLabel}>{t('keepAwakeLabel')}</Text>
                <View
                  style={[
                    sheetStyles.menuStatePill,
                    keepAwake && sheetStyles.menuStatePillOn,
                  ]}
                >
                  <Text
                    style={[
                      sheetStyles.menuStateText,
                      keepAwake && sheetStyles.menuStateTextOn,
                    ]}
                  >
                    {keepAwake ? t('onState') : t('offState')}
                  </Text>
                </View>
              </Pressable>
              <Pressable
                accessibilityRole="switch"
                accessibilityLabel={t('muteLabel')}
                accessibilityState={{ checked: muted }}
                onPress={() => setMuted(!muted)}
                style={({ pressed }) => [
                  sheetStyles.menuRow,
                  pressed && styles.pressed,
                ]}
              >
                <AppIcon
                  name={muted ? "volume-off" : "volume-on"}
                  color={muted ? palette.actionFocus : palette.textSecondary}
                  size={18}
                />
                <Text style={sheetStyles.menuRowLabel}>{t('muteLabel')}</Text>
                <View
                  style={[
                    sheetStyles.menuStatePill,
                    muted && sheetStyles.menuStatePillOn,
                  ]}
                >
                  <Text
                    style={[
                      sheetStyles.menuStateText,
                      muted && sheetStyles.menuStateTextOn,
                    ]}
                  >
                    {muted ? t('onState') : t('offState')}
                  </Text>
                </View>
              </Pressable>
            </SheetOverlay>
          ) : null}

          {/* 事件提醒由陪伴画面承担（播放器切入事件态海报/视频，播完自动回归），
              不再叠加文字横幅——保持沉浸画面无打断（doc-08 §6） */}

          {/* 中下：时钟大数字 → 暂停/结束胶囊（概念图布局）；外层开场入场编排
              （上浮 24dp + 淡入），内层内容常驻（弱化只作用于时钟以下的 chrome）。
              结算态隐藏：时钟/控件让位给 completed 媒体 + 结果 sheet */}
          {session ? (
          <Animated.View
            style={[
              styles.bottomStack,
              {
                bottom: Math.max(insets.bottom + space.x5, FLOATING_TAB_FLOOR),
                opacity: enterStack,
                transform: [
                  {
                    translateY: enterStack.interpolate({
                      inputRange: [0, 1],
                      outputRange: [24, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            {/* 时钟常显：弱化态下唯一的保留元素（「已暂停」提示随时钟一并保留）。
                外包脉冲层：完成归零瞬间数字轻跳一次；暂停时叠加呼吸循环 */}
            <View style={{ alignItems: "center" }}>
              <Animated.View
                style={{ opacity: breath, transform: [{ scale: timerPulse }] }}
              >
                <Text
                  style={styles.timerText}
                  accessibilityRole="text"
                  accessibilityLabel={i18n.t('common:remaining', { time: formatTimerSeconds(focus.remainingSeconds) })}
                >
                  {formatTimerSeconds(focus.remainingSeconds)}
                </Text>
              </Animated.View>
              {paused ? (
                <Text style={styles.pausedHint}>{t('paused')}</Text>
              ) : null}
            </View>

            <Animated.View style={{ opacity: chrome, alignItems: "center" }}>
              {/* 正在播字幕：静音时隐藏（弱化态随 chrome 一并隐去，只留时钟） */}
              {!muted && music.selectedTrack ? (
                <Text style={styles.nowPlayingText}>
                  {t('nowPlaying', { title: music.selectedTrack.title })}
                </Text>
              ) : null}
              <View style={styles.pillRow}>
                {items.map((item) => (
                  <PressableScale
                    key={item.key}
                    accessibilityRole="button"
                    accessibilityLabel={item.label}
                    disabled={item.disabled}
                    onPress={item.onPress}
                    reducedMotion={focus.reducedMotion}
                    style={[styles.pill, item.disabled && styles.pillDisabled]}
                  >
                    <AppIcon
                      name={item.icon}
                      color={semantic.textPrimary}
                      size={18}
                    />
                    <Text style={styles.pillText}>{item.label}</Text>
                  </PressableScale>
                ))}
              </View>
            </Animated.View>
          </Animated.View>
          ) : null}

          {/* 结束二次确认 sheet（补底部安全区） */}
          {session && ending ? (
            <SheetOverlay
              onClose={() => setEnding(false)}
              closeLabel={t('endConfirmStay')}
              reducedMotion={focus.reducedMotion}
              bottomInset={insets.bottom}
            >
              <Text style={sheetStyles.confirmTitle}>{t('endConfirmTitle')}</Text>
              <Text style={sheetStyles.confirmMessage}>
                {Math.round(computeEffective(session, Date.now()) / 60) > 0
                  ? t('endConfirmKept', {
                      n: Math.round(computeEffective(session, Date.now()) / 60),
                    })
                  : t('endConfirmKeptZero')}
              </Text>
              <View style={sheetStyles.confirmActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('endConfirmStay')}
                  onPress={() => setEnding(false)}
                  style={({ pressed }) => [
                    sheetStyles.confirmSecondary,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={sheetStyles.confirmSecondaryText}>
                    {t('endConfirmStay')}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('endConfirmLeave')}
                  onPress={confirmEnd}
                  style={({ pressed }) => [
                    sheetStyles.confirmDanger,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={sheetStyles.confirmDangerText}>
                    {t('endConfirmLeave')}
                  </Text>
                </Pressable>
              </View>
            </SheetOverlay>
          ) : null}

          {/* 结算覆盖层（原 S06 完成页并入）：completed 全屏媒体为背景，
              标题沉降淡入 + 结果 sheet 底部滑入；CTA 原位替换导航 */}
          {resultMode && completion ? (
            <>
              <Animated.View
                style={[
                  styles.resultTitleWrap,
                  { top: insets.top + 24 },
                  {
                    opacity: titleIn,
                    transform: [
                      {
                        translateY: titleIn.interpolate({
                          inputRange: [0, 1],
                          outputRange: [TITLE_OFFSET, 0],
                        }),
                      },
                    ],
                  },
                ]}
                pointerEvents="none"
              >
                <Text style={styles.resultTitle}>{t('completeTitle')}</Text>
              </Animated.View>
              <StudyResultSheet
                visible
                sessionSeconds={computeEffective(
                  completion.session,
                  completion.session.completedAtUtc ?? Date.now(),
                )}
                todayMinutes={completion.todayMinutes}
                weekMinutes={completion.weekMinutes}
                weekTarget={focus.week.targetMinutes}
                primaryAction={{ label: t('againAction'), onPress: again }}
                secondaryAction={{ label: t('finishToday'), onPress: finishToday }}
                reducedMotion={focus.reducedMotion}
                // StudyResultSheet 是独立窗口表面：CTA 需要 安全区 + 12
                bottomInset={insets.bottom}
              />
            </>
          ) : null}
        </View>
      </TouchableWithoutFeedback>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semantic.canvasDeep,
  },
  mediaFill: {
    // 边到边：从状态栏顶到 Home 指示条底 100% 填充
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
    backgroundColor: mediaGlassControl,
    borderWidth: 1,
    borderColor: semantic.borderSoft,
  },
  // 暂停暗角：媒体玻璃轻罩（媒体层 token，主题无关）
  vignette: {
    backgroundColor: semantic.mediaGlass,
  },
  // 快捷设置二级菜单样式已拆到 makeSheetStyles（主题化 UI 层，随亮暗翻转）
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
    ...mediaTextShadow,
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
    backgroundColor: mediaGlassControl,
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
  // 结算覆盖层标题：压在 completed 影像上（onMedia 固定浅色 + 媒体文字投影）
  resultTitleWrap: {
    position: "absolute",
    left: 20,
  },
  resultTitle: {
    ...type.title1,
    color: semantic.onMedia,
    ...mediaTextShadow,
  },
  // 结束确认 sheet 样式已拆到 makeSheetStyles（主题化 UI 层，随亮暗翻转）
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
});

/** 活动屏 sheet（快捷设置 / 结束确认）是 SheetOverlay 的主题化 UI 层：
 *  面板与内容令牌都随亮暗翻转（亮=暖纸白面板+深字）。原内容用模块级
 *  semantic.* 固定暗值 → 亮色下浅字压浅底不可读、暗玻璃行糊在亮面板上
 *  （3.3 修复）。压在影像上的 chrome（时钟/徽章/胶囊/右上入口）仍属
 *  semantic 主题无关覆盖层。 */
const makeSheetStyles = (p: ThemeColors) => StyleSheet.create({
  menuTitle: {
    ...type.title3,
    color: p.textPrimary,
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
    backgroundColor: p.successSoft,
  },
  menuStateText: {
    ...type.micro,
    color: p.textSecondary,
  },
  menuStateTextOn: {
    color: p.success,
  },
  confirmTitle: {
    ...type.title3,
    color: p.textPrimary,
    textAlign: "center",
  },
  confirmMessage: {
    ...type.body,
    color: p.textSecondary,
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
    borderColor: p.borderStandard,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.x4,
  },
  confirmSecondaryText: {
    ...type.bodyStrong,
    color: p.textSecondary,
  },
  confirmDanger: {
    flex: 1,
    minHeight: 52,
    borderRadius: radii.control,
    backgroundColor: p.danger,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.x5,
  },
  confirmDangerText: {
    ...type.bodyStrong,
    // 危险实底按钮前景恒白（与 AppButton onAction 语义一致）
    color: p.onAction,
  },
});
