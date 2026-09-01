import { createNavigationContainerRef } from '@react-navigation/native';
import { StackActions } from '@react-navigation/routers';
import type { AppRoute } from './routes';

// Most routes take no params. AuthScreen mode and PreferenceScreen kind are
// derived from the route name inside the screen wrapper (AuthRoute/PreferenceRoute).
// P0-C: groups.detail / weekly.settlement carry the target groupId.
export type GroupRouteParams = Readonly<{ groupId: string }>;

// P1-A: store.skinDetail 携带目标皮肤 slug（S15 详情/购买）。
export type SkinDetailRouteParams = Readonly<{ skinSlug: string }>;

// 自习室：studyroom.active 携带目标房间 id（房间=内置皮肤 slug）。
export type StudyRoomRouteParams = Readonly<{ roomId: string }>;

export type RootParamList = {
  [K in AppRoute]: K extends 'groups.detail' | 'weekly.settlement' ? GroupRouteParams
    : K extends 'store.skinDetail' ? SkinDetailRouteParams
    : K extends 'studyroom.active' ? StudyRoomRouteParams
    : undefined;
};

// Imperative navigation handle. AppStore.navigate/replace/back forward to this
// ref so existing useApp().navigate(...) call sites work unchanged after the
// migration to @react-navigation (issue #2: real native stack keeps source
// screens alive on push).
export const navigationRef = createNavigationContainerRef<RootParamList>();

// 四个底部 Tab 挂在根栈的 main.tabs 屏内（RootNavigator: Stack > MainTabs）。
// 这些路由名是 Tab 切换目标，不是栈内 push 页面。
export const MAIN_TABS_ROUTE = 'main.tabs';

const TAB_ROOT_ROUTES: ReadonlySet<AppRoute> = new Set([
  'home',
  'studyroom.home',
  'achievements.home',
  'leaderboard.home',
  'profile.home',
]);

// @react-navigation's navigate() overloads require a literal route name; a
// dynamic union (AppRoute) won't satisfy them, so this helper centralizes the
// cast. See https://reactnavigation.org/docs/typescript.
export function navigateRoute(name: AppRoute, params?: RootParamList[AppRoute]): void {
  if (!navigationRef.isReady()) return;
  if (params === undefined) {
    navigationRef.navigate(name as never);
    return;
  }
  (navigationRef.navigate as (screen: string, params?: unknown) => void)(name, params);
}

// 整栈重建（AppStore.replace、冷启动 deep link、登录态跳转专用）。
// Tab 根路由映射为 [main.tabs(激活对应 Tab)]；push 页面叠加在 Tab 容器之上：
// ['home', 'settings.home'] → 栈 [main.tabs(home), settings.home]。
export function resetToRoutes(names: readonly AppRoute[]): void {
  if (!navigationRef.isReady() || names.length === 0) return;
  const tabRoots = names.filter((name) => TAB_ROOT_ROUTES.has(name));
  const stacked = names.filter((name) => !TAB_ROOT_ROUTES.has(name));
  if (tabRoots.length > 0) {
    const activeTab = tabRoots[tabRoots.length - 1];
    navigationRef.reset({
      index: stacked.length,
      routes: [
        {
          name: MAIN_TABS_ROUTE,
          state: { index: 0, routes: [{ name: activeTab }] },
        },
        ...stacked.map((name) => ({ name })),
      ],
    } as never);
    return;
  }
  navigationRef.reset({
    index: names.length - 1,
    routes: names.map((name) => ({ name })),
  } as never);
}

// 原位替换栈顶路由、保留其余栈（AppStore.replace 是整栈 reset，语义不同）。
// 闭环推进专用：focus.setup → focus.active、focus.active → focus.complete。
export function replaceRoute(name: AppRoute): void {
  if (navigationRef.isReady()) {
    navigationRef.dispatch(StackActions.replace(name));
  }
}
