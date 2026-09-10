import type { StorageDriver } from '../../focus/data/storageDriver';

/**
 * 皮肤试用本地记录（24h 免费试用）：slug → 试用状态存 AsyncStorage 单键。
 * 服务端（skin_entitlements 的 trial 行）是「试过没有」的唯一真相，本地记录
 * 服务于离线判定与回落执行（fallbackSkinId = 开启试用前的当前皮肤）。
 * endReason: 'expired'（到期回落）/ 'abandoned'（试用中手动换肤）/ 'purchased'。
 */

export const SKIN_TRIALS_KEY = 'lofi.skin.trials';

export interface SkinTrialRecord {
  startedAtUtc: number;
  expiresAtUtc: number;
  endedAtUtc?: number;
  endReason?: 'expired' | 'abandoned' | 'purchased';
  /** 开启试用时的当前皮肤 id（到期回落目标；缺失回落默认皮肤） */
  fallbackSkinId?: string;
}

type TrialMap = Record<string, SkinTrialRecord>;

function sanitize(raw: unknown): TrialMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const clean: TrialMap = {};
  for (const [slug, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof slug !== 'string' || !slug) continue;
    const v = value as Partial<SkinTrialRecord>;
    if (typeof v.startedAtUtc !== 'number' || typeof v.expiresAtUtc !== 'number') continue;
    clean[slug] = {
      startedAtUtc: v.startedAtUtc,
      expiresAtUtc: v.expiresAtUtc,
      ...(typeof v.endedAtUtc === 'number' ? { endedAtUtc: v.endedAtUtc } : {}),
      ...(v.endReason === 'expired' || v.endReason === 'abandoned' || v.endReason === 'purchased'
        ? { endReason: v.endReason }
        : {}),
      ...(typeof v.fallbackSkinId === 'string' && v.fallbackSkinId
        ? { fallbackSkinId: v.fallbackSkinId }
        : {}),
    };
  }
  return clean;
}

export function createSkinTrialRepository(driver: StorageDriver) {
  async function readMap(): Promise<TrialMap> {
    const raw = await driver.get(SKIN_TRIALS_KEY);
    if (raw === null) return {};
    try {
      return sanitize(JSON.parse(raw));
    } catch {
      return {};
    }
  }

  async function writeMap(map: TrialMap): Promise<void> {
    await driver.set(SKIN_TRIALS_KEY, JSON.stringify(map));
  }

  return {
    /** 全部试用记录（损坏数据 → 空对象）。 */
    async load(): Promise<TrialMap> {
      return readMap();
    },

    /** 记录试用开启（覆盖写；服务端已保证一次性，本地以最近一次为准）。 */
    async saveTrial(slug: string, record: SkinTrialRecord): Promise<void> {
      const map = await readMap();
      map[slug] = record;
      await writeMap(map);
    },

    /** 标记结束（保留记录供「限一次」的离线判定；服务端为准，本地只是缓存）。 */
    async markEnded(slug: string, reason: 'expired' | 'abandoned' | 'purchased', now: number): Promise<void> {
      const map = await readMap();
      const record = map[slug];
      if (!record || record.endedAtUtc !== undefined) return;
      map[slug] = { ...record, endedAtUtc: now, endReason: reason };
      await writeMap(map);
    },
  };
}
