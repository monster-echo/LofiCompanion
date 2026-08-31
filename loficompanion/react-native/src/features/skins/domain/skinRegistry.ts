import type { SkinManifest } from './types';

/**
 * 皮肤注册表（P0-B 服务器分发）：内置清单 + 远端下清单的可观察合并视图。
 * 纯域逻辑（node 可测）：内置优先（slug 冲突时远端让位），变更即通知订阅者。
 * FocusStore 用 useSyncExternalStore 消费 getAll()。
 */

export function mergeSkinLists(
  builtIn: readonly SkinManifest[],
  remote: readonly SkinManifest[],
): readonly SkinManifest[] {
  const builtInSlugs = new Set(builtIn.map((skin) => skin.slug));
  return [...builtIn, ...remote.filter((skin) => !builtInSlugs.has(skin.slug))];
}

export interface SkinRegistry {
  getAll(): readonly SkinManifest[];
  subscribe(listener: () => void): () => void;
  /** 远端清单批量就位（整体替换远端侧；内置侧不变） */
  setRemote(manifests: readonly SkinManifest[]): void;
}

export function createSkinRegistry(builtIn: readonly SkinManifest[]): SkinRegistry {
  let remote: readonly SkinManifest[] = [];
  let merged = mergeSkinLists(builtIn, remote);
  const listeners = new Set<() => void>();

  function recompute(): void {
    merged = mergeSkinLists(builtIn, remote);
    for (const listener of listeners) listener();
  }

  return {
    getAll: () => merged,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setRemote(next: readonly SkinManifest[]) {
      if (next.length === remote.length && next.every((skin, i) => skin === remote[i])) return;
      remote = next;
      recompute();
    },
  };
}
