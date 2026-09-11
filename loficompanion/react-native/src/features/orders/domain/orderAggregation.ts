import type { OrderItem } from './orderModels';

// 订单中心聚合（纯函数，node 可测）：双来源归并 → 类型筛选 → 按月分组。
// 只产 monthKey（'YYYY-MM'），标签格式化留在 UI 层（locale 由 currentLanguage
// 决定，守卫禁硬编码 locale）。

export type OrderFilter = 'all' | 'membership' | 'skin';

export type OrderSection = Readonly<{
  /** 'YYYY-MM'（本地时区取自 ISO 串的 Date 解析） */
  monthKey: string;
  items: readonly OrderItem[];
}>;

/** 双来源归并按 createdAt 倒序；同刻保持 membership 在前（来源优先级稳定）。 */
export function mergeOrders(
  membership: readonly OrderItem[],
  skins: readonly OrderItem[],
): OrderItem[] {
  return [...membership, ...skins].sort((a, b) => {
    const delta = Date.parse(b.createdAt) - Date.parse(a.createdAt);
    if (delta !== 0) return delta;
    return a.key.localeCompare(b.key);
  });
}

export function filterOrders(
  items: readonly OrderItem[],
  filter: OrderFilter,
): OrderItem[] {
  if (filter === 'all') return [...items];
  return items.filter((item) => item.kind === filter);
}

/** 按月分组（输入须已倒序；组序随输入保持，组内不重排）。 */
export function groupOrdersByMonth(
  items: readonly OrderItem[],
): readonly OrderSection[] {
  const sections: { monthKey: string; items: OrderItem[] }[] = [];
  for (const item of items) {
    const date = new Date(item.createdAt);
    const monthKey = Number.isNaN(date.getTime())
      ? 'unknown'
      : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const last = sections[sections.length - 1];
    if (last && last.monthKey === monthKey) {
      last.items.push(item);
    } else {
      sections.push({ monthKey, items: [item] });
    }
  }
  return sections;
}
