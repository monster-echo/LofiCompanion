import React, { useCallback, useMemo, useState } from 'react';
import { Platform, SafeAreaView } from 'react-native';
import * as ExpoSplashScreen from 'expo-splash-screen';
import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { navigationRef } from './src/navigation/navigationRef';
import { AppRoute } from './src/navigation/routes';
import { AppProvider } from './src/state/AppStore';
import { ConnectionGate } from './src/screens/ConnectionGate';
import { FocusProvider } from './src/features/focus/application/FocusStore';
import { SyncProvider } from './src/features/sync/application/SyncStore';
import { FeedbackHost } from './src/design-system/FeedbackHost';
import { styles } from './src/theme/styles';
import { telemetry } from './src/telemetry/Telemetry';
import { AppErrorBoundary } from './src/telemetry/AppErrorBoundary';
import { SupportProvider } from './src/support/SupportStore';
import { AuthRecoveryProvider } from './src/auth/AuthRecoveryStore';
import { PreferencesProvider } from './src/preferences/PreferencesProvider';
import { usePreferences } from './src/preferences/PreferencesProvider';
import { useApp } from './src/state/AppStore';
import { useEntryIntents } from './src/navigation/useEntryIntents';
import { setPlatformHeader } from './src/data/runtimePlatform';

// 在生产 App 入口注入平台标识，apiClient 通过 getPlatformHeader() 在请求时读取，
// 使 HTTP 层不依赖 react-native 模块（node 可测试）。
setPlatformHeader(Platform.OS);

// 保持原生启动屏直到 JS 首帧渲染完成：避免冷启动时原生 splash 被瞬间替换的闪跳，
// 并遮住 expo-dev-client 下载 JS bundle 的过程（开发构建特有）。
void ExpoSplashScreen.preventAutoHideAsync();

export default function App() {
  return (
    <AppErrorBoundary>
      <AppProvider>
        <PreferencesProvider>
          <AuthRecoveryProvider>
            <SupportProvider>
              <FocusProvider>
                <SyncProvider>
                  <AppSurface />
                </SyncProvider>
              </FocusProvider>
            </SupportProvider>
          </AuthRecoveryProvider>
        </PreferencesProvider>
      </AppProvider>
    </AppErrorBoundary>
  );
}

function AppSurface() {
  const { palette } = usePreferences();
  const { openEntryRoute, refreshBootstrap, serverReady } = useApp();
  const resume = useCallback(() => { void refreshBootstrap(); }, [refreshBootstrap]);
  // 导航主题与应用夜色调色板对齐：native-tabs/native-stack 的场景底色、
  // 液态玻璃 Tab 取景都消费 theme.colors——缺省浅色主题会在切换时闪灰底。
  const navigationTheme = useMemo(
    () => ({
      ...(DarkTheme as typeof DarkTheme),
      colors: {
        primary: palette.brand,
        background: palette.background,
        card: palette.surface,
        text: palette.text,
        border: palette.border,
        notification: palette.brand,
      },
    }),
    [palette],
  );
  // 入口意图解析必须在 NavigationContainer onReady 之后（否则 navigate 早于
  // mount 触发 dev LogBox「navigation 尚未初始化」竞态警告）。
  const [navReady, setNavReady] = useState(false);
  useEntryIntents(openEntryRoute, resume, navReady);
  // 联机门禁：bootstrap 成功前不放行（hooks 顺序保持——门禁只是渲染分支）。
  if (!serverReady) return <ConnectionGate />;
  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.background }]}>
        <NavigationContainer
          ref={navigationRef}
          theme={navigationTheme}
          onReady={() => setNavReady(true)}
          onStateChange={() => {
            // Screen-view telemetry fires on every navigation state change
            // (push/pop/replace/tab switch). Replaces the old
            // useEffect([navigation.route]) in AppStore.
            const current = navigationRef.getCurrentRoute();
            if (current?.name) telemetry.screen(current.name as AppRoute);
          }}
        >
          <RootNavigator />
        </NavigationContainer>
        <FeedbackHost />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
