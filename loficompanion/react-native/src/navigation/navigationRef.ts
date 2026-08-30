import { createNavigationContainerRef } from '@react-navigation/native';
import { StackActions } from '@react-navigation/routers';
import type { AppRoute } from './routes';

// Most routes take no params. AuthScreen mode and PreferenceScreen kind are
// derived from the route name inside the screen wrapper (AuthRoute/PreferenceRoute).
// P0-C: groups.detail / weekly.settlement carry the target groupId.
export type GroupRouteParams = Readonly<{ groupId: string }>;

// P1-A: store.skinDetail 携带目标皮肤 slug（S15 详情/购买）。
export type SkinDetailRouteParams = Readonly<{ skinSlug: string }>;

export type RootParamList = {
  [K in AppRoute]: K extends 'groups.detail' | 'weekly.settlement' ? GroupRouteParams
    : K extends 'store.skinDetail' ? SkinDetailRouteParams
    : undefined;
};

// Imperative navigation handle. AppStore.navigate/replace/back forward to this
// ref so existing useApp().navigate(...) call sites work unchanged after the
// migration to @react-navigation (issue #2: real native stack keeps source
// screens alive on push).
export const navigationRef = createNavigationContainerRef<RootParamList>();

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

// 原位替换栈顶路由、保留其余栈（AppStore.replace 是整栈 reset，语义不同）。
// 闭环推进专用：focus.setup → focus.active、focus.active → focus.complete。
export function replaceRoute(name: AppRoute): void {
  if (navigationRef.isReady()) {
    navigationRef.dispatch(StackActions.replace(name));
  }
}
