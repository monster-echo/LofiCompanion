import type { StorageDriver } from '../../focus/data/storageDriver';

/**
 * 音乐选曲本地仓储（对齐 skinSelectionRepository）。单键存最近一次选择，重选即覆盖。
 */

export const MUSIC_SELECTED_KEY = 'lofi.music.selected';

export interface MusicSelection {
  trackId: string;
  selectedAtUtc: number;
}

export function createMusicSelectionRepository(driver: StorageDriver) {
  return {
    /** 当前选择的曲目；从未选过或数据损坏 → null（调用方落到默认曲目）。 */
    async loadSelected(): Promise<MusicSelection | null> {
      const raw = await driver.get(MUSIC_SELECTED_KEY);
      if (raw === null) return null;
      try {
        const parsed = JSON.parse(raw) as MusicSelection;
        if (!parsed || typeof parsed !== 'object' || typeof parsed.trackId !== 'string') {
          return null;
        }
        return parsed;
      } catch {
        return null;
      }
    },

    /** 选择曲目：覆盖旧记录。 */
    async select(trackId: string, now: number): Promise<void> {
      const record: MusicSelection = { trackId, selectedAtUtc: now };
      await driver.set(MUSIC_SELECTED_KEY, JSON.stringify(record));
    },
  };
}
