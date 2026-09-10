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
  /** 服务端 skin id（skin-{slug}）；本地清单皮肤用清单 id */
  skinId: string;
  slug: string;
  name: string;
  accessType: StoreAccessType;
  /** 包含状态数（皮肤清单未就位为 null——卡片隐藏状态行） */
  stateCount: number | null;
  /** 价格标签文案（paid：¥X/$X；free/premium 为 null——Plus 标签由 UI 按 accessType 渲染） */
  priceLabel: string | null;
  /** Plus 折扣价标签（Plus 用户 + 窗口内 + 配置了 plusPriceMinor；否则 null） */
  plusPriceLabel: string | null;
  /** 限时发售中（窗口内且非已拥有——「限时」徽标） */
  limited: boolean;
  owned: boolean;
  inUse: boolean;
}

export interface StoreSections {
  free: readonly StoreSkinCard[];
  paid: readonly StoreSkinCard[];
  premium: readonly StoreSkinCard[];
}

/** 本地免费内置皮肤的最小描述（域层不依赖 manifest 渲染） */
export interface LocalSkinInfo {
  id: string;
  slug: string;
  name: string;
  stateCount: number;
}

export type BuildCardsInput = Readonly<{
  products: readonly SkinProductRemote[];
  /** 本地清单免费皮肤（已拥有；免费区头部按此顺序展示；付费皮肤由调用方
   *  留给服务端商品行，价格/权益判定以服务端为唯一来源） */
  localSkins: readonly LocalSkinInfo[];
  /** 已登录用户的服务端权益键（未登录为空数组——未登录可浏览，仅本地免费皮肤视为已拥有） */
  ownedKeys: readonly string[];
  /** 当前使用中的皮肤 slug（本地选择仓储） */
  selectedSkinSlug: string;
  /** slug → 真实状态数（皮肤注册表解析；未命中卡片隐藏状态行） */
  stateCountFor?: (slug: string) => number | undefined;
  /** 当前时间（ms）——限时窗口判定注入时钟，node 可测 */
  now?: number;
  /** 调用方是否 Plus 会员（权益键含 catalog.premium.active） */
  isPlusUser?: boolean;
}>;

/** 分单价签：1200 分 CNY → ¥12；99 分 USD → $0.99；其余币种带 ISO 码前缀。 */
export function formatPrice(priceMinor: number, currency: string): string {
  const symbol = currency === 'CNY' ? '¥' : currency === 'USD' ? '$' : `${currency} `;
  const value = priceMinor / 100;
  const text = Number.isInteger(value) ? String(value) : value.toFixed(2);
  return `${symbol}${text}`;
}

function normalizeAccessType(raw: string): StoreAccessType {
  return raw === 'paid' || raw === 'premium' ? raw : 'free';
}

/**
 * 限时窗口判定（纯函数，node 可测）：from ≤ now ≤ until；缺省端点=无穷；
 * 不可解析的端点按无穷处理（配置错误不把商品永久藏掉——过期隐藏只影响
 * 商店分区，商品行必须留在目录里供详情页 owned 判定）。
 */
export function isWithinWindow(
  product: Pick<SkinProductRemote, 'availableFrom' | 'availableUntil'>,
  now: number,
): boolean {
  const parse = (raw: string | null | undefined): number | null => {
    if (raw == null) return null;
    const ms = Date.parse(raw);
    return Number.isNaN(ms) ? null : ms;
  };
  const fromMs = parse(product.availableFrom);
  const untilMs = parse(product.availableUntil);
  if (product.availableFrom == null && product.availableUntil == null) return false;
  if (fromMs !== null && now < fromMs) return false;
  if (untilMs !== null && now > untilMs) return false;
  return true;
}

export function buildStoreSections(input: BuildCardsInput): StoreSections {
  const ownedSet = new Set(input.ownedKeys);
  const now = input.now ?? 0;
  const cards = input.products.map<StoreSkinCard>((product) => {
    const accessType = normalizeAccessType(product.accessType);
    const owned = accessType === 'free'
      ? true
      : ownedSet.has(product.entitlementKey);
    const inWindow = isWithinWindow(product, now);
    const plusDiscount = accessType === 'paid'
      && input.isPlusUser === true
      && inWindow
      && product.plusPriceMinor != null;
    return {
      skinId: product.skinId,
      slug: product.slug,
      name: product.skinName,
      accessType,
      stateCount: input.stateCountFor?.(product.slug) ?? null,
      priceLabel: accessType === 'paid'
        ? formatPrice(product.priceMinor, product.currency)
        : null,
      plusPriceLabel: plusDiscount && product.plusPriceMinor != null
        ? formatPrice(product.plusPriceMinor, product.currency)
        : null,
      limited: !owned && inWindow,
      owned,
      inUse: product.slug === input.selectedSkinSlug,
    };
  });

  // 本地清单免费皮肤排在免费区头部（已拥有；使用中标记跟随本地选择）
  const localCards = input.localSkins.map<StoreSkinCard>((skin) => ({
    skinId: skin.id,
    slug: skin.slug,
    name: skin.name,
    accessType: 'free',
    stateCount: skin.stateCount,
    priceLabel: null,
    plusPriceLabel: null,
    limited: false,
    owned: true,
    inUse: skin.slug === input.selectedSkinSlug,
  }));

  return {
    free: [...localCards, ...cards.filter((c) => c.accessType === 'free')],
    // 窗外（未开始/已结束）付费商品从商店分区隐藏——过期不卖；商品行仍在
    // 目录（详情页可达性与 owned 判定依赖它），只是不再可买
    paid: cards.filter((c) => c.accessType === 'paid')
      .filter((c) => {
        const product = input.products.find((p) => p.slug === c.slug);
        return product === undefined || isPurchasable(product, now);
      }),
    premium: cards.filter((c) => c.accessType === 'premium'),
  };
}

/** 可售窗口：未配置窗口恒可售；配置了则需 now ∈ [from, until]（坏 ISO 按无穷端）。 */
function isPurchasable(product: SkinProductRemote, now: number): boolean {
  if (product.availableFrom == null && product.availableUntil == null) return true;
  const parse = (raw: string | null | undefined): number | null => {
    if (raw == null) return null;
    const ms = Date.parse(raw);
    return Number.isNaN(ms) ? null : ms;
  };
  const fromMs = parse(product.availableFrom);
  const untilMs = parse(product.availableUntil);
  if (fromMs !== null && now < fromMs) return false;
  if (untilMs !== null && now > untilMs) return false;
  return true;
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
