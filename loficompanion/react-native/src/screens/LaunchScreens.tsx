import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ExpoSplashScreen from 'expo-splash-screen';
import { useVideoPlayer, VideoView } from 'expo-video';
import { AppButton } from '../design-system/components';
import { PromoIllustration } from '../design-system/PromoIllustration';
import { useApp } from '../state/AppStore';
import { usePreferences } from '../preferences/PreferencesProvider';
import { useTranslation } from 'react-i18next';
import { RuntimeConfig } from '../domain/models';
import { navigationRef } from '../navigation/navigationRef';
import { colors, radii, semantic, spacing } from '../theme/tokens';
import { mediaGlassControl } from '../design-system/derivedTokens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { styles } from '../theme/styles';

const LogoImage = require('../../assets/splash-icon.png');

// 品牌闪屏阶段常量
const MIN_LOGO_MS = 1000; // logo+loading 最短展示时间，避免 bootstrap 极快时闪跳
const MAX_SPLASH_WAIT_MS = 8000; // fetch 无显式超时，最长等待兜底防挂死

// ── Splash screen ────────────────────────────────────────────────────
// 统一三端启动体验：原生 logo → 品牌闪屏 → home。闪屏仅在「在线且有 splash 配置」
// 时展示（全屏媒体 + 右上角胶囊跳过 + 倒计时）；离线或未配置 → 直接进首页。
// 合规：非按钮区域不可点击跳转，仅跳过按钮可点。
export function SplashScreen() {
  const { replace, config, bootstrapped, online } = useApp();
  const { palette } = usePreferences();
  const { t } = useTranslation('launch');
  const insets = useSafeAreaInsets();
  const [minElapsed, setMinElapsed] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const doneRef = useRef(false);

  // 首帧渲染完成后隐藏原生启动屏：与 App.tsx 的 preventAutoHideAsync 配合，
  // 无缝过渡到 JS 品牌闪屏，避免闪跳并遮住 dev-client 的 bundle 下载。
  useEffect(() => {
    void ExpoSplashScreen.hideAsync();
  }, []);

  const goHome = useCallback(() => {
    if (doneRef.current) return;
    if (!navigationRef.isReady()) {
      // 容器未就绪时 resetToRoutes 会静默 no-op——稍后重试且不置 doneRef，
      // 保证无论时序如何最终一定逃生（不永久卡 splash）。
      setTimeout(goHome, 200);
      return;
    }
    doneRef.current = true;
    replace('home');
  }, [replace]);

  useEffect(() => {
    const t = setTimeout(() => setMinElapsed(true), MIN_LOGO_MS);
    return () => clearTimeout(t);
  }, []);

  // fetch 无显式超时，最长等待兜底，避免一直卡在 loading。定时器只挂一次，
  // 经 ref 间接调用 goHome：goHome 身份随 config 轮询刷新（useCallback 依赖
  // config.features），直接作为依赖会让计时器被反复重置、兜底永远不触发。
  const goHomeRef = useRef(goHome);
  useEffect(() => { goHomeRef.current = goHome; }, [goHome]);
  useEffect(() => {
    const t = setTimeout(() => goHomeRef.current(), MAX_SPLASH_WAIT_MS);
    return () => clearTimeout(t);
  }, []);

  // 开发构建跳过人为等待：不做 logo 最短展示，也不进品牌闪屏（联调反复冷启动
  // 不必陪跑开屏倒计时）；线上（release）行为不变。
  const ready = (__DEV__ || minElapsed) && bootstrapped;
  useEffect(() => {
    if (!ready || countdown !== null) return;
    if (__DEV__ || !config.splash || !online) {
      goHome(); // dev 直达首页；未配置闪屏或离线 → 直接进首页
      return;
    }
    // 进闪屏前预加载图片：远程图首拉 1-2s，在 loading 阶段拉好，
    // 进入品牌闪屏时图片已就绪、0 等待。失败也照常进闪屏（走 fallback）。
    const url = config.splash.imageUrl;
    const enter = () => setCountdown(config.splash!.durationSeconds);
    if (url) Image.prefetch(url).finally(enter);
    else enter();
  }, [ready, config.splash, online, countdown, goHome]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      goHome();
      return;
    }
    const t = setTimeout(() => setCountdown((c) => (c === null ? c : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [countdown, goHome]);

  if (countdown === null) {
    // 阶段 loading：logo + appName + tagline + 转圈 + "加载中…"
    // 背景用 app 主色，原生 splash → loading → 闪屏 → home 全程一致
    return (
      <View accessibilityLabel={t('starting')} style={[styles.centered, { backgroundColor: palette.background }]}>
        <Image
          source={LogoImage}
          style={launchStyles.logoMark}
          accessibilityLabel={t('brandIcon')}
        />
        <ActivityIndicator color={colors.brand} style={launchStyles.loadingSpinner} />
      </View>
    );
  }

  // countdown 非空即已确认有 splash 配置；类型兜底
  const splash = config.splash;
  if (!splash) return null;
  const canSkip = splash.skippable !== false;
  return (
    <View style={[launchStyles.splashRoot, { backgroundColor: palette.background }]}>
      <SplashMedia splash={splash} background={palette.background} />
      <View pointerEvents="box-none" style={[launchStyles.overlay, { paddingTop: spacing.x3 + insets.top }]}>
        <View style={launchStyles.topBar}>
          <SkipCapsule canSkip={canSkip} countdown={Math.max(countdown, 0)} onSkip={goHome} />
        </View>
      </View>
    </View>
  );
}

// 右上角胶囊跳过按钮（开屏广告标准形态：半透明深底 + 白字 + 倒计时）
function SkipCapsule({
  canSkip,
  countdown,
  onSkip,
}: Readonly<{ canSkip: boolean; countdown: number; onSkip: () => void }>) {
  const { t } = useTranslation('launch');
  return (
    <Pressable
      accessibilityLabel={t('skipSplash', { n: countdown })}
      accessibilityRole="button"
      onPress={onSkip}
      style={launchStyles.skipCapsule}
    >
      <Text style={launchStyles.skipCapsuleText}>
        {canSkip ? t('skipShort', { n: countdown }) : `${countdown}s`}
      </Text>
    </Pressable>
  );
}

// 全屏媒体背景：视频（videoUrl）> 图片（imageUrl cover）> 品牌 fallback。
// 视频静音自动循环播放（iOS 自动播放需静音）；加载失败自动回退下一级。
// 媒体加载期间显示白底 logo 占位，加载完成后淡入，避免等待期黑屏。
function SplashMedia({
  splash,
  background,
}: Readonly<{ splash: NonNullable<RuntimeConfig['splash']>; background: string }>) {
  const { t } = useTranslation('launch');
  const [failed, setFailed] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    setFailed(false);
    setMediaReady(false);
    fade.setValue(0);
  }, [splash.imageUrl, splash.videoUrl, fade]);

  const player = useVideoPlayer(splash.videoUrl ?? null, (p) => {
    p.loop = true;
    p.muted = true;
    if (splash.videoUrl) p.play();
  });
  useEffect(() => {
    const sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'error') setFailed(true);
      if (status === 'readyToPlay') setMediaReady(true);
    });
    return () => sub.remove();
  }, [player]);

  useEffect(() => {
    if (mediaReady) {
      Animated.timing(fade, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    }
  }, [mediaReady, fade]);

  const hasMedia = (splash.videoUrl || splash.imageUrl) && !failed;

  return (
    <View style={[launchStyles.splashMediaRoot, { backgroundColor: background }]}>
      {/* 媒体加载占位：app 背景色 + 品牌 logo，避免等待期黑屏/色差 */}
      <View style={[launchStyles.mediaPlaceholder, { backgroundColor: background }]}>
        <Image source={LogoImage} style={launchStyles.placeholderLogo} accessibilityLabel={t('brandIcon')} />
      </View>
      {hasMedia ? (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]}>
          {splash.videoUrl ? (
            <VideoView
              contentFit="cover"
              nativeControls={false}
              player={player}
              style={StyleSheet.absoluteFill}
            />
          ) : (
            <Image
              accessibilityLabel={t('splashImage')}
              onError={() => setFailed(true)}
              onLoad={() => setMediaReady(true)}
              resizeMode="cover"
              source={{ uri: splash.imageUrl ?? undefined }}
              style={StyleSheet.absoluteFill}
            />
          )}
        </Animated.View>
      ) : (
        // 无媒体或加载失败 → 品牌 fallback（内置插画 + 活动文案）
        <View style={[StyleSheet.absoluteFill, launchStyles.fallback, { backgroundColor: background }]}>
          <PromoIllustration />
          <Text style={launchStyles.badge}>{splash.badge}</Text>
          <Text style={styles.title}>{splash.title}</Text>
          <Text style={styles.secondary}>{splash.description}</Text>
        </View>
      )}
    </View>
  );
}

export function OnboardingScreen() {
  const { replace } = useApp();
  const { t } = useTranslation('launch');
  return (
    <View style={styles.centered}>
      <PromoIllustration />
      <Text style={styles.title}>{t('onboardingTitle')}</Text>
      <Text style={styles.secondary}>{t('onboardingHint')}</Text>
      <View style={launchStyles.fullWidth}>
        <AppButton label={t('onboardingDone')} onPress={() => replace('home')} />
      </View>
    </View>
  );
}

const launchStyles = StyleSheet.create({
  splashRoot: { flex: 1 },
  splashMediaRoot: { flex: 1 },
  mediaPlaceholder: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderLogo: { width: 48, height: 48, opacity: 0.6 },
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    justifyContent: 'space-between',
    padding: spacing.x3,
  },
  topBar: { alignItems: 'flex-end' },
  skipCapsule: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
    minWidth: 72,
    paddingHorizontal: spacing.x3,
    borderRadius: radii.round,
    backgroundColor: mediaGlassControl,
  },
  // 静态闪屏无 palette 上下文：媒体层 token 直接取模块级语义（onMedia 恒浅色）
  skipCapsuleText: { color: semantic.onMedia, fontSize: 14, fontWeight: '600' },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.x2,
    padding: spacing.x6,
  },
  // 与原生闪屏同尺寸（app.json imageWidth=256）：PNG 四周约 25% 透明留白，
  // 可见 logo ≈115pt，原生→JS 过渡 logo 不跳变；PNG 底部留白约 62pt，
  // spinner 用负 margin 拉回可见 logo 下方约 22pt。
  logoMark: { width: 256, height: 256 },
  badge: { color: colors.brand, fontSize: 13, fontWeight: '700' },
  fullWidth: { width: '100%' },
  loadingSpinner: { marginTop: -spacing.x10 },
});
