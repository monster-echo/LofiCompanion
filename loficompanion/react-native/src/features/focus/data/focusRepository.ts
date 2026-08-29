import type { FocusSessionDoc } from '../domain/types';
import type { StorageDriver } from './storageDriver';

/**
 * 专注会话本地仓储（P0-A Task 6）。唯一持久化入口是注入的 StorageDriver，
 * 应用层传 `AsyncStorage`（结构满足接口），node 测试传 in-memory 实现。
 */

export const FOCUS_ACTIVE_KEY = 'lofi.focus.active';
export const FOCUS_HISTORY_KEY = 'lofi.focus.history';

export function createFocusRepository(driver: StorageDriver) {
  async function loadHistory(): Promise<FocusSessionDoc[]> {
    const raw = await driver.get(FOCUS_HISTORY_KEY);
    if (raw === null) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      // 调用方约定：数组按时间顺序追加，新的在末尾；只放终态文档
      return Array.isArray(parsed) ? (parsed as FocusSessionDoc[]) : [];
    } catch {
      return [];
    }
  }

  return {
    /** 保存唯一进行中的会话快照（active/paused）。 */
    async saveActive(doc: FocusSessionDoc): Promise<void> {
      await driver.set(FOCUS_ACTIVE_KEY, JSON.stringify(doc));
    },

    /** 读取进行中的会话；坏 JSON 或 docVersion ≠ 1 → null（视为无活动会话）。 */
    async loadActive(): Promise<FocusSessionDoc | null> {
      const raw = await driver.get(FOCUS_ACTIVE_KEY);
      if (raw === null) return null;
      try {
        const parsed = JSON.parse(raw) as FocusSessionDoc;
        if (!parsed || typeof parsed !== 'object' || parsed.docVersion !== 1) return null;
        return parsed;
      } catch {
        return null;
      }
    },

    /** 会话结束（完成/放弃）入历史后清除活动位。 */
    async clearActive(): Promise<void> {
      await driver.remove(FOCUS_ACTIVE_KEY);
    },

    /** 追加终态文档到历史末尾（append-only，新的在末尾）。 */
    async appendHistory(doc: FocusSessionDoc): Promise<void> {
      const history = await loadHistory();
      history.push(doc);
      await driver.set(FOCUS_HISTORY_KEY, JSON.stringify(history));
    },

    /** 全部历史（完成/放弃的终态文档）；空或坏 JSON → 空数组。 */
    loadHistory,
  };
}
