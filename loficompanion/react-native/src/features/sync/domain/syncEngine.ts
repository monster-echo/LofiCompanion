// 同步域纯函数：队列/一次性迁移标记/状态机。零 RN import，node 可测。
// 客户端保持 local-first：同步失败不阻塞本地闭环，重试安全（幂等键）。

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error';

export interface SyncState {
  status: SyncStatus;
  /** 游客历史已迁移的标记（登录后一次性）；null = 未迁移 */
  migratedAt: number | null;
  /** 已确认同步到服务端的本地会话 id（clientRequestId） */
  syncedIds: readonly string[];
  lastError: string | null;
}

export const initialSyncState: SyncState = {
  status: 'idle',
  migratedAt: null,
  syncedIds: [],
  lastError: null,
};

/** 登录后是否需要执行一次性迁移。 */
export function shouldMigrate(state: SyncState, isLoggedIn: boolean): boolean {
  return isLoggedIn && state.migratedAt === null;
}

/** 本地会话文档 → 服务端迁移 wire 形态（docs/04 FocusSession 事件口径）。 */
export function toMigrationPayload(
  doc: {
    clientRequestId: string;
    activity: string;
    plannedSeconds: number;
    status: string;
    startedAtUtc: number;
    pauses: ReadonlyArray<{ start: number; end: number }>;
    completedAtUtc?: number;
    abandonedAtUtc?: number;
    installationId?: string;
  },
): Record<string, unknown> {
  return {
    clientRequestId: doc.clientRequestId,
    activity: doc.activity,
    plannedSeconds: doc.plannedSeconds,
    status: doc.status === 'abandoned' ? 'abandoned' : 'completed',
    startedAtUtc: doc.startedAtUtc,
    pauses: doc.pauses,
    completedAtUtc: doc.completedAtUtc,
    abandonedAtUtc: doc.abandonedAtUtc,
    installationId: doc.installationId,
  };
}

/** 迁移成功后派生新状态：全部本地历史视为已同步。 */
export function afterMigrationSuccess(
  state: SyncState,
  ids: readonly string[],
  now: number,
): SyncState {
  return {
    ...state,
    status: 'synced',
    migratedAt: now,
    syncedIds: [...new Set([...state.syncedIds, ...ids])],
    lastError: null,
  };
}

/** 迁移/同步失败：保留标记（可重试），进入 error。 */
export function afterSyncFailure(state: SyncState, message: string): SyncState {
  return { ...state, status: 'error', lastError: message };
}

/** 未登录：本地累积（offline 语义），不改迁移标记。 */
export function afterOffline(state: SyncState): SyncState {
  return { ...state, status: 'offline' };
}
