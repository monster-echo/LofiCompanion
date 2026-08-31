import React from 'react';
import { useRoute } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootParamList } from './navigationRef';

import { AuthScreen, AuthMode } from '../screens/AuthScreens';
import { OnboardingScreen, SplashScreen } from '../screens/LaunchScreens';
import { EditProfileScreen, ProfileScreen } from '../screens/ProfileScreens';
import { MembershipScreen } from '../screens/MembershipScreen';
import { CheckoutScreen } from '../screens/CheckoutScreen';
import { CouponsScreen, InviteScreen, StatisticsScreen } from '../screens/ProfileUtilityScreens';
import { AccountSecurityScreen, DevicesScreen, SettingsScreen } from '../screens/SettingsScreens';
import {
  DeleteAccountScreen,
  PreferenceScreen,
  PreferenceKind,
} from '../screens/SettingsPreferenceScreens';
import {
  LegalIndexScreen,
  PrivacyPolicyScreen,
  SubscriptionTermsScreen,
  TermsOfServiceScreen,
} from '../screens/LegalScreens';
import { StateGalleryScreen } from '../screens/StateGalleryScreen';
import { AboutScreen, NotificationsScreen, OrdersScreen } from '../screens/DataScreens';
import { SupportHomeScreen, TicketDetailScreen } from '../screens/SupportScreens';
import { NewTicketScreen, ProductFeedbackScreen } from '../screens/SupportFormScreens';
import { PermissionsScreen, StorageScreen, TextSizeScreen } from '../screens/SettingsUtilityScreens';
import { useApp } from '../state/AppStore';
import { usePreferences } from '../preferences/PreferencesProvider';
import { AppIcon, IconName } from '../design-system/AppIcon';
import { semantic } from '../theme/tokens';
import { FocusHomeScreen } from '../features/focus/presentation/FocusHomeScreen';
import { FocusSetupSheet } from '../features/focus/presentation/FocusSetupSheet';
import { FocusActiveScreen } from '../features/focus/presentation/FocusActiveScreen';
import { FocusCompleteScreen } from '../features/focus/presentation/FocusCompleteScreen';
import { SkinGalleryScreen } from '../features/skins/presentation/SkinGalleryScreen';
import { SkinStoreScreen } from '../features/store/presentation/SkinStoreScreen';
import { SkinDetailScreen } from '../features/store/presentation/SkinDetailScreen';
import { AchievementsScreen } from '../features/achievements/presentation/AchievementsScreen';
import { HistoryScreen } from '../features/achievements/presentation/HistoryScreen';
import { RoomScreen } from '../features/achievements/presentation/RoomScreen';
import { LeaderboardSignInScreen } from '../features/leaderboards/presentation/LeaderboardSignInScreen';
import { LeaderboardHomeScreen } from '../features/leaderboards/presentation/LeaderboardHomeScreen';
import { GroupDetailScreen } from '../features/leaderboards/presentation/GroupDetailScreen';
import { LeaderboardRulesScreen } from '../features/leaderboards/presentation/LeaderboardRulesScreen';
import { WeeklySettlementScreen } from '../features/leaderboards/presentation/WeeklySettlementScreen';

const Stack = createNativeStackNavigator<RootParamList>();

// 四个主 Tab 的参数均为 undefined，直接复用根参数表子集。
type RootTabList = Pick<
  RootParamList,
  'home' | 'achievements.home' | 'leaderboard.home' | 'profile.home'
>;

const Tab = createBottomTabNavigator<RootTabList>();

type TabDef = Readonly<{
  name: keyof RootTabList;
  icon: IconName;
  zh: string;
  en: string;
}>;

// doc-08 §1：四个 Tab 根页——专注 / 成就 / 排行 / 我的
const TABS: readonly TabDef[] = [
  { name: 'home', icon: 'droplet', zh: '专注', en: 'Focus' },
  { name: 'achievements.home', icon: 'bookmark', zh: '成就', en: 'Achievements' },
  { name: 'leaderboard.home', icon: 'group', zh: '排行', en: 'Ranks' },
  { name: 'profile.home', icon: 'user', zh: '我的', en: 'Me' },
];

/**
 * 底部 Tab 容器（@react-navigation/bottom-tabs）。Tab 屏懒挂载、访问后保活，
 * 切换不再整页重建（issue #1/#9）。样式按 doc-07 夜色：surface 底 +
 * borderSoft 上边框，active actionPrimary / inactive textMuted；
 * 底部安全区由 App 外层 SafeArea 承担，Tab bar 高 64（doc-07 §7.3）。
 */
function MainTabs() {
  const { locale } = usePreferences();
  return (
    <Tab.Navigator
      initialRouteName="home"
      safeAreaInsets={{ bottom: 0 }}
      screenOptions={{
        headerShown: false,
        lazy: true,
        tabBarActiveTintColor: semantic.actionPrimary,
        tabBarInactiveTintColor: semantic.textMuted,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        tabBarStyle: {
          backgroundColor: semantic.surface,
          borderTopColor: semantic.borderSoft,
          borderTopWidth: 1,
          height: 64,
        },
        sceneStyle: { backgroundColor: semantic.canvas },
      }}
    >
      {TABS.map((tab) => (
        <Tab.Screen
          key={tab.name}
          name={tab.name}
          component={TAB_COMPONENTS[tab.name]}
          options={{
            tabBarLabel: locale === 'en-US' ? tab.en : tab.zh,
            tabBarAccessibilityLabel: tab.zh,
            tabBarIcon: ({ color }) => (
              <AppIcon name={tab.icon} color={color} size={22} />
            ),
          }}
        />
      ))}
    </Tab.Navigator>
  );
}

const TAB_COMPONENTS: Readonly<Record<keyof RootTabList, React.ComponentType>> = {
  home: FocusHomeScreen,
  'achievements.home': AchievementsScreen,
  'leaderboard.home': LeaderboardRoute,
  'profile.home': ProfileScreen,
};

const AUTH_MODES: Record<string, AuthMode> = {
  'auth.signIn': 'signIn',
  'auth.signUp': 'signUp',
  'auth.phone': 'phone',
  'auth.forgotPassword': 'forgot',
  'auth.verifyEmail': 'verify',
  'auth.resetPassword': 'reset',
};

// AuthScreen takes a `mode` prop; derive it from the route name so each auth
// route reuses one component via a thin wrapper.
function AuthRoute() {
  const route = useRoute();
  return <AuthScreen mode={AUTH_MODES[route.name] ?? 'signIn'} />;
}

const PREF_KIND: Record<string, { kind: PreferenceKind; title: string }> = {
  'settings.notifications': { kind: 'notifications', title: '通知设置' },
  'settings.general': { kind: 'general', title: '通用设置' },
  'settings.privacy': { kind: 'privacy', title: '隐私设置' },
  'settings.appearance': { kind: 'appearance', title: '外观主题' },
  'settings.language': { kind: 'language', title: '语言' },
};

function PreferenceRoute() {
  const route = useRoute();
  const cfg = PREF_KIND[route.name];
  return (
    <PreferenceScreen kind={cfg?.kind ?? 'general'} title={cfg?.title ?? ''} />
  );
}

// 排行 Tab 根页：已登录 → 真实榜单（S10），未登录 → 保留登录引导壳。
function LeaderboardRoute() {
  const { signedIn } = useApp();
  return signedIn ? <LeaderboardHomeScreen /> : <LeaderboardSignInScreen />;
}

// The native stack keeps source screens mounted on push, so going back from a
// detail page does not rebuild the list (issue #2). Header is hidden — each
// screen renders its own AppHeader. 四个主 Tab 挂在 main.tabs 屏内
// （MainTabs / bottom-tabs），其余路由均为 push 页面。
export function RootNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="launch.splash"
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen name="launch.splash" component={SplashScreen} />
      <Stack.Screen name="launch.onboarding" component={OnboardingScreen} />

      {/* 四个底部 Tab（doc-08 §1 路由表）：专注 / 成就 / 排行 / 我的 */}
      <Stack.Screen name="main.tabs" component={MainTabs} />

      {/* 专注闭环 push 页（doc-08 §1 路由表） */}
      <Stack.Screen name="skins.gallery" component={SkinGalleryScreen} />
      {/* 皮肤商店与详情购买（doc-08 §15/§16，P1-A）：未登录可浏览，
          购买时在详情页内引导登录，不走受保护路由 */}
      <Stack.Screen name="store.home" component={SkinStoreScreen} />
      <Stack.Screen name="store.skinDetail" component={SkinDetailScreen} />
      <Stack.Screen
        name="focus.setup"
        component={FocusSetupSheet}
        options={{
          presentation: 'transparentModal',
          animation: 'none', // 入场动效由 SheetOverlay 按 doc-07 §10 自绘
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="focus.active"
        component={FocusActiveScreen}
        options={{
          presentation: 'fullScreenModal',
          // 专注中不允许手势下滑退出（doc-08 §5 ending 语义由确认 sheet 承担）
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="focus.complete"
        component={FocusCompleteScreen}
        options={{ presentation: 'fullScreenModal', gestureEnabled: false }}
      />

      {/* 记录/房间 push 页（doc-08 §8–§10）+ 规则隐私/小组/周结算 push 页
          （doc-08 §11–§14，P0-C） */}
      <Stack.Screen name="history.week" component={HistoryScreen} />
      <Stack.Screen name="room.home" component={RoomScreen} />
      <Stack.Screen name="leaderboard.rules" component={LeaderboardRulesScreen} />
      <Stack.Screen name="groups.detail" component={GroupDetailScreen} />
      <Stack.Screen name="weekly.settlement" component={WeeklySettlementScreen} />

      <Stack.Screen name="auth.signIn" component={AuthRoute} />
      <Stack.Screen name="auth.signUp" component={AuthRoute} />
      <Stack.Screen name="auth.phone" component={AuthRoute} />
      <Stack.Screen name="auth.forgotPassword" component={AuthRoute} />
      <Stack.Screen name="auth.verifyEmail" component={AuthRoute} />
      <Stack.Screen name="auth.resetPassword" component={AuthRoute} />

      <Stack.Screen name="profile.edit" component={EditProfileScreen} />
      <Stack.Screen name="profile.statistics" component={StatisticsScreen} />
      <Stack.Screen name="profile.invite" component={InviteScreen} />
      <Stack.Screen name="profile.coupons" component={CouponsScreen} />

      <Stack.Screen name="membership.home" component={MembershipScreen} />
      <Stack.Screen name="membership.plans" component={MembershipScreen} />
      <Stack.Screen name="membership.checkout" component={CheckoutScreen} />
      <Stack.Screen name="membership.orders" component={OrdersScreen} />

      <Stack.Screen name="notifications.center" component={NotificationsScreen} />

      <Stack.Screen name="settings.home" component={SettingsScreen} />
      <Stack.Screen name="settings.accountSecurity" component={AccountSecurityScreen} />
      <Stack.Screen name="settings.devices" component={DevicesScreen} />
      <Stack.Screen name="settings.notifications" component={PreferenceRoute} />
      <Stack.Screen name="settings.general" component={PreferenceRoute} />
      <Stack.Screen name="settings.privacy" component={PreferenceRoute} />
      <Stack.Screen name="settings.appearance" component={PreferenceRoute} />
      <Stack.Screen name="settings.language" component={PreferenceRoute} />
      <Stack.Screen name="settings.textSize" component={TextSizeScreen} />
      <Stack.Screen name="settings.storage" component={StorageScreen} />
      <Stack.Screen name="settings.permissions" component={PermissionsScreen} />
      <Stack.Screen name="settings.legal" component={LegalIndexScreen} />
      <Stack.Screen name="settings.privacyPolicy" component={PrivacyPolicyScreen} />
      <Stack.Screen name="settings.termsOfService" component={TermsOfServiceScreen} />
      <Stack.Screen name="settings.subscriptionTerms" component={SubscriptionTermsScreen} />
      <Stack.Screen name="settings.helpFeedback" component={SupportHomeScreen} />
      <Stack.Screen name="support.newTicket" component={NewTicketScreen} />
      <Stack.Screen name="support.ticket" component={TicketDetailScreen} />
      <Stack.Screen name="support.feedback" component={ProductFeedbackScreen} />
      <Stack.Screen name="settings.about" component={AboutScreen} />
      <Stack.Screen name="settings.deleteAccount" component={DeleteAccountScreen} />
      <Stack.Screen name="states.gallery" component={StateGalleryScreen} />
    </Stack.Navigator>
  );
}
