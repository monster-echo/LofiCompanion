import { describe, expect, it } from 'vitest';
import {
  filterOrders,
  groupOrdersByMonth,
  mergeOrders,
  type OrderFilter,
} from './orderAggregation';
import { fromMembershipOrder, fromSkinOrder, statusMeta, displayTitleOf } from './orderModels';
import type { OrderView } from '../../../domain/models';
import type { SkinOrderRemote } from '../../../data/apiClient';

// 订单中心聚合与归一（纯逻辑）：跨源归并排序、类型筛选、跨月分组边界、
// 状态语义矩阵。文案转译不在 domain（i18n 守卫）。

const membership = (overrides: Partial<OrderView> = {}): OrderView => ({
  id: 'ord-1',
  planId: 'plus-monthly',
  status: 'success',
  amountMinor: 1200,
  currency: 'USD',
  provider: 'store',
  createdAt: '2026-09-10T12:00:00.000Z',
  completedAt: '2026-09-10T12:00:01.000Z',
  ...overrides,
});

const skin = (overrides: Partial<SkinOrderRemote> = {}): SkinOrderRemote => ({
  orderId: 'skin-ord-1',
  skinId: 'skin-midnight-workstation',
  slug: 'midnight-workstation',
  entitlementKey: 'skin.official.midnight-workstation',
  priceMinor: 99,
  currency: 'USD',
  status: 'success',
  provider: 'store',
  storeProductId: 'tech.zhongbei.loficompanion.theme.midnight',
  createdAt: '2026-09-09T08:00:00.000Z',
  completedAt: '2026-09-09T08:00:01.000Z',
  entitled: true,
  ...overrides,
});

describe('fromMembershipOrder / fromSkinOrder（双来源归一）', () => {
  it('会员单：key 前缀 membership、title=planId、slug=null、成功即 entitled', () => {
    const item = fromMembershipOrder(membership());
    expect(item.key).toBe('membership:ord-1');
    expect(item.kind).toBe('membership');
    expect(item.title).toBe('plus-monthly');
    expect(item.slug).toBeNull();
    expect(item.status).toBe('success');
    expect(item.entitled).toBe(true);
    expect(item.detail.storeProductId).toBeNull();
  });

  it('皮肤单：key 前缀 skin、title=slug、状态经 parseOrderStatus、entitled 透传', () => {
    const item = fromSkinOrder(skin());
    expect(item.key).toBe('skin:skin-ord-1');
    expect(item.title).toBe('midnight-workstation');
    expect(item.slug).toBe('midnight-workstation');
    expect(item.status).toBe('success');
    expect(item.entitled).toBe(true);
    expect(item.detail.storeProductId).toBe('tech.zhongbei.loficompanion.theme.midnight');
    expect(item.detail.entitlementKey).toBe('skin.official.midnight-workstation');
  });

  it('未知皮肤状态归 pending（parseOrderStatus 兜底）', () => {
    expect(fromSkinOrder(skin({ status: 'weird' })).status).toBe('pending');
  });
});

describe('mergeOrders（跨源倒序归并）', () => {
  it('按 createdAt 倒序混排', () => {
    const merged = mergeOrders(
      [fromMembershipOrder(membership({ createdAt: '2026-09-10T12:00:00.000Z' }))],
      [fromSkinOrder(skin({ createdAt: '2026-09-11T00:00:00.000Z' }))],
    );
    expect(merged.map((item) => item.key)).toEqual([
      'skin:skin-ord-1',
      'membership:ord-1',
    ]);
  });

  it('同刻 stable：membership 在前（key 字典序兜底）', () => {
    const merged = mergeOrders(
      [fromMembershipOrder(membership({ createdAt: '2026-09-10T12:00:00.000Z' }))],
      [fromSkinOrder(skin({ createdAt: '2026-09-10T12:00:00.000Z' }))],
    );
    expect(merged[0]?.kind).toBe('membership');
  });
});

describe('filterOrders（类型筛选）', () => {
  const items = [
    fromMembershipOrder(membership()),
    fromSkinOrder(skin()),
  ];

  it.each([['all', 2], ['membership', 1], ['skin', 1]] as readonly [OrderFilter, number][])(
    '%s → %d 条',
    (filter, count) => {
      expect(filterOrders(items, filter)).toHaveLength(count);
    },
  );

  it('membership 只留会员单；skin 只留皮肤单', () => {
    expect(filterOrders(items, 'membership').every((item) => item.kind === 'membership')).toBe(true);
    expect(filterOrders(items, 'skin').every((item) => item.kind === 'skin')).toBe(true);
  });
});

describe('groupOrdersByMonth（跨月分组）', () => {
  // 本地正午构造 ISO：分组按本地日历月（产品语义），测试在任意时区下确定
  const iso = (year: number, month: number, day: number) =>
    new Date(year, month - 1, day, 12).toISOString();

  it('同月并组、异月切段（输入倒序时组序即时序）', () => {
    const items = [
      fromMembershipOrder(membership({ createdAt: iso(2026, 9, 10) })),
      fromSkinOrder(skin({ createdAt: iso(2026, 9, 1) })),
      fromMembershipOrder(membership({ id: 'ord-8', createdAt: iso(2026, 8, 31) })),
    ];
    const sections = groupOrdersByMonth(items);
    expect(sections.map((section) => section.monthKey)).toEqual(['2026-09', '2026-08']);
    expect(sections[0]?.items).toHaveLength(2);
    expect(sections[1]?.items).toHaveLength(1);
  });

  it('乱序输入不重排组内（分组只切段）', () => {
    const items = [
      fromMembershipOrder(membership({ createdAt: iso(2026, 8, 1) })),
      fromSkinOrder(skin({ createdAt: iso(2026, 9, 1) })),
    ];
    const sections = groupOrdersByMonth(items);
    expect(sections.map((section) => section.monthKey)).toEqual(['2026-08', '2026-09']);
  });

  it('非法时间戳落 unknown 组（不抛）', () => {
    const sections = groupOrdersByMonth([
      fromMembershipOrder(membership({ createdAt: 'not-a-date' })),
    ]);
    expect(sections[0]?.monthKey).toBe('unknown');
  });

  it('空输入 → 空分组', () => {
    expect(groupOrdersByMonth([])).toEqual([]);
  });
});

describe('statusMeta（状态语义矩阵）', () => {
  it('success/failed/refunded/pending/processing → 图标与色调', () => {
    expect(statusMeta('success')).toEqual({ icon: 'check-circle', tone: 'success' });
    expect(statusMeta('failed')).toEqual({ icon: 'close', tone: 'error' });
    expect(statusMeta('refunded')).toEqual({ icon: 'rotate-ccw', tone: 'neutral' });
    expect(statusMeta('pending')).toEqual({ icon: 'clock', tone: 'warning' });
    expect(statusMeta('processing')).toEqual({ icon: 'clock', tone: 'warning' });
  });
});

describe('displayTitleOf（标识符转人读词形）', () => {
  it('kebab/snake 转空格并首字母大写（ASCII）', () => {
    expect(displayTitleOf(fromMembershipOrder(membership({ planId: 'plus-monthly' })))).toBe('Plus Monthly');
    expect(displayTitleOf(fromSkinOrder(skin({ slug: 'midnight_workstation' })))).toBe('Midnight Workstation');
  });

  it('无分隔符原样返回', () => {
    expect(displayTitleOf(fromSkinOrder(skin({ slug: 'rain' })))).toBe('Rain');
  });
});
