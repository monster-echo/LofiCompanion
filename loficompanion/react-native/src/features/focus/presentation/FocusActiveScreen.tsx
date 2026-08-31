import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AppIcon } from '../../../design-system/AppIcon';
import { FocusActionBar, FocusActionItem } from '../../../design-system/FocusActionBar';
import { FocusTimerRing } from '../../../design-system/FocusTimerRing';
import { replaceRoute } from '../../../navigation/navigationRef';
import { useApp } from '../../../state/AppStore';
import { radii, semantic, space, type } from '../../../theme/tokens';
import { useFocus } from '../application/FocusStore';
import { effectiveSeconds as computeEffective } from '../domain/engine';
import { ImmersiveMediaSurface } from '../../skins/presentation/ImmersiveMediaSurface';
import { SheetOverlay } from './SheetOverlay';
import { FOCUS_STRINGS as STR } from './strings';
import type { CompanionEventType } from '../../skins/domain/types';
import type { IconName } from '../../../design-system/AppIcon';

/** 事件横幅按事件类型的图标与文案（doc-08 §22：温和具体，不负担）。 */
const BANNER_COPY: Partial<Record<CompanionEventType, { icon: IconName; title: string; subtitle: string }>> = {
  'wellness.drink': { icon: 'droplet', title: STR.drinkBannerTitle, subtitle: STR.drinkBannerSubtitle },
  'focus.started': { icon: 'play', title: STR.startBannerTitle, subtitle: STR.startBannerSubtitle },
  'focus.resumed': { icon: 'play', title: STR.resumeBannerTitle, subtitle: STR.resumeBannerSubtitle },
  'focus.paused': { icon: 'pause', title: STR.pauseBannerTitle, subtitle: STR.pauseBannerSubtitle },
  'focus.completed': { icon: 'check-circle', title: STR.completeBannerTitle, subtitle: STR.completeBannerSubtitle },
  'break.started': { icon: 'plant', title: STR.pauseBannerTitle, subtitle: STR.pauseBannerSubtitle },
};

/**
 * S04 专注中（doc-08 §5，全产品视觉金标准）。焦点依次为：角色动作、剩余
 * 时间、必要控制。挂载 5s 后界面弱化（控制/顶部 0.32、计时 0.82），任意
 * 触碰 160ms 恢复；读屏开启时不自动弱化。1s interval 驱动 tick；到点自动
 * complete 并原位替换为完成页。
 */

const RING_SIZE = 196;
/** 计时环中心 Y（doc-08 §5：屏幕水平中心、Y≈250，从真实屏幕顶算起） */
const RING_CENTER_Y = 250;
/** 弱化：开始 5s 后触发；恢复 160ms；弱化淡入 600ms（doc-07 §10 只规范恢复值） */
const WEAKEN_AFTER_MS = 5000;
const RESTORE_MS = 160;
const WEAKEN_MS = 600;
const CHROME_OPACITY = 0.32;
const RING_OPACITY = 0.82;
/** 喝水横幅：180ms 淡入并下移 8dp；退出 140ms（doc-07 §10）；减少动态仅 100ms 淡入 */
const BANNER_IN_MS = 180;
const BANNER_OUT_MS = 140;
const BANNER_REDUCED_MS = 100;

export function FocusActiveScreen() {
  const focus = useFocus();
  const { showToast, replace } = useApp();
  const insets = useSafeAreaInsets();
  const [ending, setEnding] = useState(false);
  const [screenReader, setScreenReader] = useState(false);
  const [weakened, setWeakened] = useState(false);
  // 局部时间源：横幅进度与冷却倒计时的渲染刷新（比 store 快照更细）
  const [nowMs, bumpNow] = useReducer(() => Date.now(), Date.now());

  const chrome = useRef(new Animated.Value(1)).current;
  const ringFade = useRef(new Animated.Value(1)).current;
  const bannerAnim = useRef(new Animated.Value(0)).current;
  const weakenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completedRef = useRef(false);

  const session = focus.activeSession;
  const paused = session?.status === 'paused';
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
    const duration = target ? WEAKEN_MS : RESTORE_MS;
    Animated.parallel([
      Animated.timing(chrome, {
        toValue: target ? CHROME_OPACITY : 1,
        duration,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(ringFade, {
        toValue: target ? RING_OPACITY : 1,
        duration,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();
  }, [weakened, screenReader, chrome, ringFade]);

  // Android 返回不退出专注：仅唤醒界面
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      wake();
      return true;
    });
    return () => sub.remove();
  }, [wake]);

  // ---- 1s 计时驱动 ----
  const tick = focus.actions.tick;
  useEffect(() => {
    const id = setInterval(() => tick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [tick]);

  // ---- 完成：到点结算并原位替换为完成页 ----
  useEffect(() => {
    if (!session || session.status !== 'active') return;
    if (focus.remainingSeconds > 0 || completedRef.current) return;
    completedRef.current = true;
    focus.actions.complete(Date.now());
    replaceRoute('focus.complete');
  }, [session, focus.remainingSeconds, focus.actions]);

  // ---- 喝水横幅进出 ----
  const [displayBanner, setDisplayBanner] = useState(focus.banner);
  const bannerTotalRef = useRef(0);
  const prevBannerRef = useRef(focus.banner);
  useEffect(() => {
    const current = focus.banner;
    if (current && !prevBannerRef.current) {
      bannerTotalRef.current = Math.max(1, current.endsAt - Date.now());
    }
    prevBannerRef.current = current;
    if (current) setDisplayBanner(current);
    Animated.timing(bannerAnim, {
      toValue: current ? 1 : 0,
      duration: focus.reducedMotion
        ? BANNER_REDUCED_MS
        : current
          ? BANNER_IN_MS
          : BANNER_OUT_MS,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!current && finished) setDisplayBanner(null);
    });
  }, [focus.banner, focus.reducedMotion, bannerAnim]);

  // 横幅可见时 250ms 刷新局部时间，驱动进度线
  useEffect(() => {
    if (!displayBanner) return;
    const id = setInterval(bumpNow, 250);
    return () => clearInterval(id);
  }, [displayBanner, bumpNow]);

  if (!session) {
    // complete/abandon 已提交、替换导航进行中的一帧空壳
    return <View style={styles.screen} />;
  }

  const bannerRatio = displayBanner
    ? Math.max(
        0,
        Math.min(1, (displayBanner.endsAt - nowMs) / bannerTotalRef.current),
      )
    : 0;

  // 喝水不再提供手动按钮：由主题配置自动排程（skin.yaml wellness.autoDrink，
  // 区间随机触发 wellness.drink 事件——陪伴动作与横幅照常出现）。
  const items: FocusActionItem[] = [
    paused
      ? {
          key: 'resume',
          icon: 'play',
          label: STR.resumeAction,
          variant: 'neutral',
          onPress: () => {
            wake();
            focus.actions.resume(Date.now());
          },
        }
      : {
          key: 'pause',
          icon: 'pause',
          label: STR.pauseAction,
          variant: 'neutral',
          onPress: () => {
            wake();
            focus.actions.pause(Date.now());
          },
        },
    {
      key: 'end',
      icon: 'stop',
      label: STR.endAction,
      variant: 'neutral',
      disabled: ending, // doc-08 §5 ending：结束禁用，确认 sheet 出现
      onPress: () => {
        wake();
        setEnding(true);
      },
    },
  ];

  const confirmEnd = () => {
    const keptMinutes = Math.round(
      computeEffective(session, Date.now()) / 60,
    );
    setEnding(false);
    focus.actions.abandon(Date.now());
    showToast(keptMinutes > 0 ? STR.keptMinutes(keptMinutes) : STR.keptNothing, 'info');
    replace('home');
  };

  return (
    <TouchableWithoutFeedback onPress={wake}>
      <View style={styles.screen}>
        {/* 沉浸专注：隐藏系统状态栏，卸载时由 PreferencesProvider 恢复 light */}
        <StatusBar hidden animated={false} />
        <ImmersiveMediaSurface
          manifest={focus.skin}
          state={mediaState}
          reducedMotion={focus.reducedMotion}
          style={StyleSheet.absoluteFill}
        />

        {/* 计时环：中心 Y≈250；暂停时中心下方显示「已暂停」 */}
        <Animated.View
          style={[styles.ringWrap, { top: RING_CENTER_Y - insets.top - RING_SIZE / 2, opacity: ringFade }]}
        >
          <FocusTimerRing
            remainingSeconds={focus.remainingSeconds}
            totalSeconds={session.plannedSeconds}
            durationLabel={paused ? STR.paused : undefined}
          />
        </Animated.View>

        {/* S05 事件横幅（左右 16、高 72、安全区下 12）——文案与图标随事件类型 */}
        {displayBanner ? (
          <Animated.View
            accessibilityLiveRegion="polite"
            style={[
              styles.banner,
              {
                top: insets.top + 12,
                opacity: bannerAnim,
                transform: [
                  {
                    translateY: bannerAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: focus.reducedMotion ? [0, 0] : [8, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.bannerIcon}>
              <AppIcon
                name={BANNER_COPY[displayBanner.eventType]?.icon ?? 'droplet'}
                color={semantic.actionPrimary}
                size={22}
              />
            </View>
            <View style={styles.bannerText}>
              <Text style={styles.bannerTitle}>
                {BANNER_COPY[displayBanner.eventType]?.title ?? STR.drinkBannerTitle}
              </Text>
              <Text style={styles.bannerSubtitle}>
                {BANNER_COPY[displayBanner.eventType]?.subtitle ?? STR.drinkBannerSubtitle}
              </Text>
            </View>
            <View style={styles.bannerTrack} pointerEvents="none">
              <View
                style={[styles.bannerFill, { width: `${Math.round(bannerRatio * 100)}%` }]}
              />
            </View>
          </Animated.View>
        ) : null}

        {/* 控制栏（底部安全区上 64） */}
        <Animated.View style={[styles.controls, { opacity: chrome }]}>
          <FocusActionBar items={items} />
        </Animated.View>

        {/* 结束二次确认 sheet */}
        {ending ? (
          <SheetOverlay
            onClose={() => setEnding(false)}
            closeLabel={STR.endConfirmStay}
            reducedMotion={focus.reducedMotion}
          >
            <Text style={styles.confirmTitle}>{STR.endConfirmTitle}</Text>
            <Text style={styles.confirmMessage}>
              {Math.round(computeEffective(session, Date.now()) / 60) > 0
                ? STR.endConfirmKept(Math.round(computeEffective(session, Date.now()) / 60))
                : STR.endConfirmKeptZero}
            </Text>
            <View style={styles.confirmActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={STR.endConfirmStay}
                onPress={() => setEnding(false)}
                style={({ pressed }) => [styles.confirmSecondary, pressed && styles.pressed]}
              >
                <Text style={styles.confirmSecondaryText}>{STR.endConfirmStay}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={STR.endConfirmLeave}
                onPress={confirmEnd}
                style={({ pressed }) => [styles.confirmDanger, pressed && styles.pressed]}
              >
                <Text style={styles.confirmDangerText}>{STR.endConfirmLeave}</Text>
              </Pressable>
            </View>
          </SheetOverlay>
        ) : null}
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semantic.canvasDeep,
  },
  ringWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  banner: {
    // top 由渲染处注入（insets.top + 12，横幅始终在安全区之下）
    position: 'absolute',
    left: space.x4,
    right: space.x4,
    height: 72,
    borderRadius: radii.control,
    backgroundColor: semantic.surfaceRaised,
    borderWidth: 1,
    borderColor: semantic.borderStandard,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x3,
    paddingHorizontal: space.x3,
    overflow: 'hidden',
  },
  bannerIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.round,
    backgroundColor: semantic.surfaceInset,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerText: {
    flexShrink: 1,
    gap: 2,
  },
  bannerTitle: {
    ...type.bodyStrong,
    color: semantic.textPrimary,
  },
  bannerSubtitle: {
    ...type.caption,
    color: semantic.textSecondary,
  },
  bannerTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
    backgroundColor: semantic.surfaceInset,
  },
  bannerFill: {
    height: '100%',
    backgroundColor: semantic.actionPrimary,
  },
  controls: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 64,
    alignItems: 'center',
  },
  confirmTitle: {
    ...type.title3,
    color: semantic.textPrimary,
    textAlign: 'center',
  },
  confirmMessage: {
    ...type.body,
    color: semantic.textSecondary,
    textAlign: 'center',
    marginTop: space.x2,
  },
  confirmActions: {
    flexDirection: 'row',
    alignItems: 'center',
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
    alignItems: 'center',
    justifyContent: 'center',
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
    alignItems: 'center',
    justifyContent: 'center',
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
