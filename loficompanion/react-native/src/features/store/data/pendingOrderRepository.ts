import type { StorageDriver } from '../../focus/data/storageDriver';

/**
 * 皮肤待完成订单本地记录（P1-A Task 3，docs/05 §5 支付中断恢复）。
 * slug → { orderId, userId } 映射存 AsyncStorage 单键：下单成功即写入，
 * 验证到终态（成功/失败）即清除；下次进入详情页凭此轮询查单恢复终态。
 *
 * 记录按账号隔离（v2）：load 必须携带当前 userId，不匹配视为无记录但
 * 保留原账号的记录（换回账号仍可恢复）。v1（slug → orderId 字符串）为
 * 无主残留——换账号后查单 404 永远清不掉，读时直接清除自愈。
 */

export const PENDING_SKIN_ORDERS_KEY = 'lofi.store.pendingSkinOrders';

type PendingOrderEntry = Readonly<{ orderId: string; userId: string }>;

type PendingOrderMap = Record<string, PendingOrderEntry>;

export function createPendingOrderRepository(driver: StorageDriver) {
  async function readMap(): Promise<{ map: PendingOrderMap; dropped: boolean }> {
    const raw = await driver.get(PENDING_SKIN_ORDERS_KEY);
    if (raw === null) return { map: {}, dropped: false };
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return { map: {}, dropped: true }; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { map: {}, dropped: true };
    }
    const clean: Record<string, PendingOrderEntry> = {};
    let dropped = false;
    for (const [slug, entry] of Object.entries(parsed as Record<string, unknown>)) {
      // v2 形态：{ orderId, userId } 双字符串
      if (
        entry && typeof entry === 'object'
        && typeof (entry as PendingOrderEntry).orderId === 'string' && (entry as PendingOrderEntry).orderId
        && typeof (entry as PendingOrderEntry).userId === 'string' && (entry as PendingOrderEntry).userId
      ) {
        clean[slug] = entry as PendingOrderEntry;
      } else {
        // v1 字符串形态 / 非法形态：无主残留，丢弃不迁移
        dropped = true;
      }
    }
    return { map: clean, dropped };
  }

  async function writeMap(map: PendingOrderMap): Promise<void> {
    await driver.set(PENDING_SKIN_ORDERS_KEY, JSON.stringify(map));
  }

  return {
    /** 该皮肤当前账号的待完成订单 id；无记录/他人记录/数据损坏 → null。 */
    async load(skinSlug: string, userId: string): Promise<string | null> {
      const { map, dropped } = await readMap();
      // 无主残留（v1 升级 / 损坏）：读时物理清除，杜绝死记录反复被解析
      if (dropped) await writeMap(map).catch(() => undefined);
      return map[skinSlug]?.userId === userId ? map[skinSlug].orderId : null;
    },

    /** 下单成功后记录（连同下单账号），供中断恢复。 */
    async save(skinSlug: string, orderId: string, userId: string): Promise<void> {
      const { map } = await readMap();
      map[skinSlug] = { orderId, userId };
      await writeMap(map);
    },

    /** 订单到达终态（成功/失败/退款）后清除。 */
    async clear(skinSlug: string): Promise<void> {
      const { map } = await readMap();
      if (!(skinSlug in map)) return;
      delete map[skinSlug];
      await writeMap(map);
    },
  };
}
