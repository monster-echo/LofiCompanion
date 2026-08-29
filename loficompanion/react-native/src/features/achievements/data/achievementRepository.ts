import type { StorageDriver } from '../../focus/data/storageDriver';
import type { AchievementDef, AchievementRuleKey, RoomItemId } from '../domain/rules';

/**
 * 成就/收藏物本地仓储（P0-A Task 6）。薄 CRUD：授予与解锁一律幂等，
 * 同一 ruleKey / itemId 重复写入是 no-op（离线补同步、重复评估不产生脏数据）。
 */

export const ACHIEVEMENTS_GRANTED_KEY = 'lofi.achievements.granted';
export const ROOM_ITEMS_KEY = 'lofi.room.items';

export interface AchievementGrant {
  ruleKey: AchievementRuleKey;
  grantedAtUtc: number;
  sourceSessionId?: string;
  ruleVersion: 1;
}

export interface RoomItemRecord {
  itemId: RoomItemId;
  unlockedAtUtc: number;
  sourceRuleKey: AchievementRuleKey;
}

export function createAchievementRepository(driver: StorageDriver) {
  async function loadGranted(): Promise<AchievementGrant[]> {
    const raw = await driver.get(ACHIEVEMENTS_GRANTED_KEY);
    if (raw === null) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as AchievementGrant[]) : [];
    } catch {
      return [];
    }
  }

  async function loadRoomItems(): Promise<RoomItemRecord[]> {
    const raw = await driver.get(ROOM_ITEMS_KEY);
    if (raw === null) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as RoomItemRecord[]) : [];
    } catch {
      return [];
    }
  }

  return {
    loadGranted,

    /** 授予成就：已授予同一 ruleKey 则 no-op 返回 false；否则写入并返回 true。 */
    async recordGrant(
      ruleKey: AchievementRuleKey,
      def: AchievementDef,
      sourceSessionId: string | undefined,
      now: number,
    ): Promise<boolean> {
      const granted = await loadGranted();
      if (granted.some((grant) => grant.ruleKey === ruleKey)) return false;
      const record: AchievementGrant = {
        ruleKey,
        grantedAtUtc: now,
        ...(sourceSessionId !== undefined ? { sourceSessionId } : {}),
        ruleVersion: def.ruleVersion,
      };
      granted.push(record);
      await driver.set(ACHIEVEMENTS_GRANTED_KEY, JSON.stringify(granted));
      return true;
    },

    loadRoomItems,

    /** 解锁成就对应的房间收藏物：同一 itemId 只解锁一次，重复调用 no-op。 */
    async recordRoomItem(def: AchievementDef, now: number): Promise<boolean> {
      const items = await loadRoomItems();
      if (items.some((item) => item.itemId === def.rewardItemId)) return false;
      items.push({
        itemId: def.rewardItemId,
        unlockedAtUtc: now,
        sourceRuleKey: def.ruleKey,
      });
      await driver.set(ROOM_ITEMS_KEY, JSON.stringify(items));
      return true;
    },
  };
}
