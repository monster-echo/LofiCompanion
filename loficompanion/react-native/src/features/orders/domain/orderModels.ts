import { IconName } from '../../../design-system/AppIcon';
import type { OrderView } from '../../../domain/models';
import type { SkinOrderRemote } from '../../../data/apiClient';
import { parseOrderStatus, type OrderStatus } from '../../../payment/paymentModels';

// 订单中心统一模型：会员单（auth 基础设施）与皮肤单（biz）双来源归一。
// 标题存原始 id/slug，文案转译留给 UI 层（i18n 守卫禁硬编码）；金额/状态
// 是服务端真源，客户端不重算。

export type OrderKind = 'membership' | 'skin';

export type OrderItem = Readonly<{
  /** `${kind}:${id}`——跨源唯一键（列表 key/展开态） */
  key: string;
  kind: OrderKind;
  id: string;
  /** 会员=planId；皮肤=slug（UI 经 i18n/目录转显示名） */
  title: string;
  /** 皮肤深链目标（store.skinDetail）；会员单恒 null */
  slug: string | null;
  status: OrderStatus;
  amountMinor: number;
  currency: string;
  provider: string;
  createdAt: string;
  completedAt: string | null;
  entitled: boolean;
  detail: Readonly<{
    storeProductId: string | null;
    entitlementKey: string | null;
  }>;
}>;

export function fromMembershipOrder(order: OrderView): OrderItem {
  return {
    key: `membership:${order.id}`,
    kind: 'membership',
    id: order.id,
    title: order.planId,
    slug: null,
    status: order.status,
    amountMinor: order.amountMinor,
    currency: order.currency,
    provider: order.provider,
    createdAt: order.createdAt,
    completedAt: order.completedAt,
    // 会员权益入账即 success（refunded 单权益已被撤销）
    entitled: order.status === 'success',
    detail: {
      storeProductId: null,
      entitlementKey: null,
    },
  };
}

export function fromSkinOrder(order: SkinOrderRemote): OrderItem {
  return {
    key: `skin:${order.orderId}`,
    kind: 'skin',
    id: order.orderId,
    title: order.slug,
    slug: order.slug,
    status: parseOrderStatus(order.status),
    amountMinor: order.priceMinor,
    currency: order.currency,
    provider: order.provider,
    createdAt: order.createdAt,
    completedAt: order.completedAt,
    entitled: order.entitled,
    detail: {
      storeProductId: order.storeProductId || null,
      entitlementKey: order.entitlementKey,
    },
  };
}

export type OrderStatusTone = 'success' | 'error' | 'warning' | 'neutral';

/**
 * 列表显示名：planId/slug 是标识符（'plus-monthly'），转人读词形（'Plus
 * Monthly'）——纯格式转换非文案，i18n 守卫不受影响。
 */
export function displayTitleOf(item: OrderItem): string {
  return item.title
    .replace(/[-_]+/g, ' ')
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/**
 * 状态 → 语义图标与色调（订单中心 StatusPill）。图标+颜色双通道编码，
 * 不单靠颜色区分（无障碍）。
 */
export function statusMeta(status: OrderStatus): { icon: IconName; tone: OrderStatusTone } {
  switch (status) {
    case 'success':
      return { icon: 'check-circle', tone: 'success' };
    case 'failed':
      return { icon: 'close', tone: 'error' };
    case 'refunded':
      return { icon: 'rotate-ccw', tone: 'neutral' };
    case 'pending':
    case 'processing':
    default:
      return { icon: 'clock', tone: 'warning' };
  }
}
