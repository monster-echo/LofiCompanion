import type { StorageDriver } from '../../focus/data/storageDriver';

/**
 * 场景化推荐关闭记录（夜猫子推荐卡的「关闭」）：slug → dismissedAtUtc。
 * 关闭 ≠ 永久——冷却期（7 天）过后可再出现；记录挂 AsyncStorage 单键。
 */

export const RECOMMENDATION_PREFS_KEY = 'lofi.store.recommendations';

type DismissMap = Record<string, number>;

export function createRecommendationPrefsRepository(driver: StorageDriver) {
  async function readMap(): Promise<DismissMap> {
    const raw = await driver.get(RECOMMENDATION_PREFS_KEY);
    if (raw === null) return {};
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      const clean: DismissMap = {};
      for (const [slug, at] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof slug === 'string' && slug && typeof at === 'number') clean[slug] = at;
      }
      return clean;
    } catch {
      return {};
    }
  }

  return {
    async dismissedAt(slug: string): Promise<number | null> {
      const map = await readMap();
      return map[slug] ?? null;
    },
    async dismiss(slug: string, now: number): Promise<void> {
      const map = await readMap();
      map[slug] = now;
      await driver.set(RECOMMENDATION_PREFS_KEY, JSON.stringify(map));
    },
  };
}
