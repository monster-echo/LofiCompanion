import type { SkinOrderRemote, SkinProductRemote } from '../../../data/apiClient';

/**
 * 皮肤商店目录组装（doc-08 §15 S14 / docs/05 §8，P1-A Task 3）。
 * 纯函数、node 可测：把服务端目录与本地内置皮肤合并成三个分区
 * （免费 / 永久购买 / Plus 精选），并推导卡片状态
 * （价格标签 / 已拥有勾 / 使用中）。价格只来自服务端，不显示虚构原价。
 */

/** 与服务端 skins.access_type 对齐的分区语义 */
export type StoreAccessType = 'free' | 'paid' | 'premium';

export interface StoreSkinCard {
  /** 服务端 skin id（skin-{slug}）；内置免费皮肤用本地清单 id */
  skinId: string;
  slug: string;
  name: string;
  accessType: StoreAccessType;
  /** 包含状态数（卡片展示「6 个状态」） */
  stateCount: number;
  /** 价格标签文案（paid：¥X；free/premium 为 null——Plus 标签由 UI 按 accessType 渲染） */
  priceLabel: string | null;
  owned: boolean;
  inUse: boolean;
}

export interface StoreSections {
  free: readonly StoreSkinCard[];
  paid: readonly StoreSkinCard[];
  premium: readonly StoreSkinCard[];
}

/** 本地内置皮肤的最小描述（域层不依赖 manifest 渲染） */
export interface LocalSkinInfo {
  id: string;
  slug: string;
  name: string;
  stateCount: number;
}

export type BuildCardsInput = Readonly<{
  products: readonly SkinProductRemote[];
  /** 本地内置皮肤（全免费、已拥有；免费区头部按此顺序展示） */
  localSkins: readonly LocalSkinInfo[];
  /** 已登录用户的服务端权益键（未登录为空数组——未登录可浏览，仅本地免费皮肤视为已拥有） */
  ownedKeys: readonly string[];
  /** 当前使用中的皮肤 slug（本地选择仓储） */
  selectedSkinSlug: string;
}>;

/** 分单价签：1200 分 CNY → ¥12；非整数分保留两位（¥12.50）。 */
export function formatPrice(priceMinor: number, currency: string): string {
  const symbol = currency === 'CNY' ? '¥' : `${currency} `;
  const value = priceMinor / 100;
  const text = Number.isInteger(value) ? String(value) : value.toFixed(2);
  return `${symbol}${text}`;
}

function normalizeAccessType(raw: string): StoreAccessType {
  return raw === 'paid' || raw === 'premium' ? raw : 'free';
}

export function buildStoreSections(input: BuildCardsInput): StoreSections {
  const ownedSet = new Set(input.ownedKeys);
  const cards = input.products.map<StoreSkinCard>((product) => {
    const accessType = normalizeAccessType(product.accessType);
    const owned = accessType === 'free'
      ? true
      : ownedSet.has(product.entitlementKey);
    return {
      skinId: product.skinId,
      slug: product.slug,
      name: product.skinName,
      accessType,
      stateCount: 6,
      priceLabel: accessType === 'paid'
        ? formatPrice(product.priceMinor, product.currency)
        : null,
      owned,
      inUse: product.slug === input.selectedSkinSlug,
    };
  });

  // 本地内置免费皮肤排在免费区头部（已拥有；使用中标记跟随本地选择）
  const localCards = input.localSkins.map<StoreSkinCard>((skin) => ({
    skinId: skin.id,
    slug: skin.slug,
    name: skin.name,
    accessType: 'free',
    stateCount: skin.stateCount,
    priceLabel: null,
    owned: true,
    inUse: skin.slug === input.selectedSkinSlug,
  }));

  return {
    free: [...localCards, ...cards.filter((c) => c.accessType === 'free')],
    paid: cards.filter((c) => c.accessType === 'paid'),
    premium: cards.filter((c) => c.accessType === 'premium'),
  };
}

/** 「已拥有」轻量视图：本地已选 + 服务端已购（权益键命中）都算。 */
export function ownedCardCount(sections: StoreSections): number {
  return [...sections.free, ...sections.paid, ...sections.premium]
    .filter((card) => card.owned).length;
}

/**
 * 中断恢复轮询的终态判据（docs/05 §5）：entitled 权益已生效 → 解锁完成；
 * failed/refunded → 订单终败（清本地记录，允许重新购买）；其余继续轮询。
 */
export function resolveRecovery(
  order: Pick<SkinOrderRemote, 'status' | 'entitled'>,
): 'unlocked' | 'failed' | 'keepWaiting' {
  if (order.status === 'success' || order.entitled) return 'unlocked';
  if (order.status === 'failed' || order.status === 'refunded') return 'failed';
  return 'keepWaiting';
}

/**
 * 下单幂等键（docs/05 §5：同键同单）。RN/Hermes 无统一 crypto.randomUUID，
 * 用 uuid v4 模板 + Math.random（与模板 useDataActions 的随机键同源）。
 */
export function newSkinOrderIdempotencyKey(): string {
  const hex = (n: number) => Array.from(
    { length: n },
    () => Math.floor(Math.random() * 16).toString(16),
  ).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
}
