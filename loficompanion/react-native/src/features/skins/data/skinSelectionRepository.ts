import type { StorageDriver } from '../../focus/data/storageDriver';

/**
 * 皮肤选择本地仓储（P0-A Task 6）。单键存最近一次选择，重选即覆盖。
 */

export const SKIN_SELECTED_KEY = 'lofi.skin.selected';

export interface SkinSelection {
  skinId: string;
  selectedAtUtc: number;
}

export function createSkinSelectionRepository(driver: StorageDriver) {
  return {
    /** 当前选择的皮肤；从未选过或数据损坏 → null（调用方落到默认皮肤）。 */
    async loadSelected(): Promise<SkinSelection | null> {
      const raw = await driver.get(SKIN_SELECTED_KEY);
      if (raw === null) return null;
      try {
        const parsed = JSON.parse(raw) as SkinSelection;
        if (!parsed || typeof parsed !== 'object' || typeof parsed.skinId !== 'string') {
          return null;
        }
        return parsed;
      } catch {
        return null;
      }
    },

    /** 选择皮肤：覆盖旧记录。 */
    async select(skinId: string, now: number): Promise<void> {
      const record: SkinSelection = { skinId, selectedAtUtc: now };
      await driver.set(SKIN_SELECTED_KEY, JSON.stringify(record));
    },
  };
}
