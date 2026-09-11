import { useMemo } from 'react';

import { apiClient } from '../../../data/apiClient';
import { useAsyncRefresh } from '../../leaderboards/application/useAsyncRefresh';
import { mergeOrders, type OrderFilter } from '../domain/orderAggregation';
import {
  fromMembershipOrder,
  fromSkinOrder,
  type OrderItem,
} from '../domain/orderModels';

// 订单中心数据面：会员单（auth）与皮肤单（biz）双来源 allSettled——单侧失败
// 保留另一侧并标记（partial 提示条），双侧全失败才整页 error + 重试。
// 复用 useAsyncRefresh（下拉刷新保留旧数据；deps 含 signedIn，登录态切换重载）。

export type OrderCenterData = Readonly<{
  items: readonly OrderItem[];
  membershipFailed: boolean;
  skinsFailed: boolean;
}>;

async function loadOrderCenter(): Promise<OrderCenterData> {
  const [membershipResult, skinsResult] = await Promise.allSettled([
    apiClient.orders(),
    apiClient.skinOrders(),
  ]);
  const membership = membershipResult.status === 'fulfilled'
    ? membershipResult.value.map(fromMembershipOrder)
    : [];
  const skins = skinsResult.status === 'fulfilled'
    ? skinsResult.value.orders.map(fromSkinOrder)
    : [];
  if (membershipResult.status === 'rejected' && skinsResult.status === 'rejected') {
    // 双侧全败：抛第一个原因，交给 useAsyncRefresh 的整页 error 态
    throw membershipResult.reason;
  }
  return {
    items: mergeOrders(membership, skins),
    membershipFailed: membershipResult.status === 'rejected',
    skinsFailed: skinsResult.status === 'rejected',
  };
}

export function useOrderCenter(signedIn: boolean, filter: OrderFilter) {
  const { state, refreshing, refresh, reload } = useAsyncRefresh(
    loadOrderCenter,
    [signedIn],
  );

  const sections = useMemo(() => {
    if (state.status !== 'ready') return [];
    return state.data.items.filter((item) => (
      filter === 'all' ? true : item.kind === filter
    ));
  }, [state, filter]);

  const failedSources = state.status === 'ready'
    ? { membershipFailed: state.data.membershipFailed, skinsFailed: state.data.skinsFailed }
    : { membershipFailed: false, skinsFailed: false };

  return { state, refreshing, refresh, reload, visibleItems: sections, failedSources };
}
