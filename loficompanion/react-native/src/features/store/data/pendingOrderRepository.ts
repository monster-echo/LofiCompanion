import type { StorageDriver } from '../../focus/data/storageDriver';

/**
 * 皮肤待完成订单本地记录（P1-A Task 3，docs/05 §5 支付中断恢复）。
 * slug → orderId 映射存 AsyncStorage 单键：下单成功即写入，验证到终态
 * （成功/失败）即清除；下次进入详情页凭此轮询查单恢复终态。
 */

export const PENDING_SKIN_ORDERS_KEY = 'lofi.store.pendingSkinOrders';

type PendingOrderMap = Record<string, string>;

export function createPendingOrderRepository(driver: StorageDriver) {
  async function readMap(): Promise<PendingOrderMap> {
    const raw = await driver.get(PENDING_SKIN_ORDERS_KEY);
    if (raw === null) return {};
    try {
      const parsed = JSON.parse(raw) as PendingOrderMap;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      const clean: PendingOrderMap = {};
      for (const [slug, orderId] of Object.entries(parsed)) {
        if (typeof slug === 'string' && typeof orderId === 'string' && orderId) {
          clean[slug] = orderId;
        }
      }
      return clean;
    } catch {
      return {};
    }
  }

  async function writeMap(map: PendingOrderMap): Promise<void> {
    await driver.set(PENDING_SKIN_ORDERS_KEY, JSON.stringify(map));
  }

  return {
    /** 该皮肤的待完成订单 id；无记录或数据损坏 → null。 */
    async load(skinSlug: string): Promise<string | null> {
      const map = await readMap();
      return map[skinSlug] ?? null;
    },

    /** 下单成功后记录，供中断恢复。 */
    async save(skinSlug: string, orderId: string): Promise<void> {
      const map = await readMap();
      map[skinSlug] = orderId;
      await writeMap(map);
    },

    /** 订单到达终态（成功/失败/退款）后清除。 */
    async clear(skinSlug: string): Promise<void> {
      const map = await readMap();
      if (!(skinSlug in map)) return;
      delete map[skinSlug];
      await writeMap(map);
    },
  };
}
