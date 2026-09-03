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
  // 幂等守卫：登出链路上有多处独立触发整栈重建的回调（onSignedOut、
  // ProfileScreens 访客直达 effect、会话过期 handler），不设防时登录页会被
  // 连续装载两次（入场动画重播 = 「进入两次登录页」）。目标链与当前栈
  // 完全一致时跳过 reset。
  if (targetChainEqualsCurrent(tabRoots, stacked)) return;
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

// 目标 reset 链是否与当前根栈逐层一致（只比路由名，不比 params）。
// Tab 容器展开为 [main.tabs, activeTab]；多压的页面（如 settings.home 之上
// 再 push）会导致链不等，此时仍然执行 reset。
function targetChainEqualsCurrent(
  tabRoots: readonly AppRoute[],
  stacked: readonly AppRoute[],
): boolean {
  const target = tabRoots.length > 0
    ? [MAIN_TABS_ROUTE, tabRoots[tabRoots.length - 1] as string, ...stacked]
    : [...tabRoots, ...stacked];
  const chain: string[] = [];
  let cursor = navigationRef.getRootState() as unknown as
    | { index: number; routes: { name: string; state?: unknown }[] }
    | undefined;
  while (cursor) {
    const route = cursor.routes[cursor.index];
    if (!route) break;
    chain.push(route.name);
    cursor = route.state as typeof cursor;
  }
  return chain.length === target.length
    && chain.every((name, index) => name === target[index]);
}

// 原位替换栈顶路由、保留其余栈（AppStore.replace 是整栈 reset，语义不同）。
// 闭环推进专用：focus.setup → focus.active、focus.active → focus.complete。
export function replaceRoute(name: AppRoute): void {
  if (navigationRef.isReady()) {
    navigationRef.dispatch(StackActions.replace(name));
  }
}
