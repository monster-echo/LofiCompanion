import { describe, expect, it } from 'vitest';
import {
  afterMigrationSuccess, afterOffline, afterSyncFailure,
  initialSyncState, shouldMigrate, toMigrationPayload,
} from './syncEngine';
import type { FocusSessionDoc } from '../../focus/domain/types';

const doc = (clientRequestId: string): FocusSessionDoc => ({
  id: clientRequestId,
  clientRequestId,
  activity: 'homework',
  plannedSeconds: 1500,
  status: 'completed',
  startedAtUtc: 1_700_000_000_000,
  pauses: [],
  completedAtUtc: 1_700_000_150_000,
  docVersion: 1,
});

describe('同步引擎纯逻辑', () => {
  it('一次性迁移标记：未迁移且已登录 → 需要迁移', () => {
    expect(shouldMigrate(initialSyncState, true)).toBe(true);
    expect(shouldMigrate({ ...initialSyncState, migratedAt: 123 }, true)).toBe(false);
    expect(shouldMigrate(initialSyncState, false)).toBe(false);
  });

  it('迁移 payload：只暴露服务端需要的字段（snake 口径）', () => {
    const payload = toMigrationPayload({
      ...doc('req-1'),
      completedAtUtc: 1_700_000_150_000,
      installationId: 'inst-1',
    });
    expect(payload.clientRequestId).toBe('req-1');
    expect(payload.status).toBe('completed');
    expect(payload.plannedSeconds).toBe(1500);
    expect(payload.installationId).toBe('inst-1');
    expect(Object.keys(payload)).not.toContain('docVersion');
  });

  it('迁移成功：标记 migratedAt 并合并 syncedIds 去重', () => {
    const next = afterMigrationSuccess(initialSyncState, ['a', 'b'], 1000);
    expect(next.status).toBe('synced');
    expect(next.migratedAt).toBe(1000);
    const again = afterMigrationSuccess(next, ['b', 'c'], 2000);
    expect(again.syncedIds).toEqual(['a', 'b', 'c']);
  });

  it('失败与离线：保留迁移标记以便重试', () => {
    const failed = afterSyncFailure(initialSyncState, '网络错误');
    expect(failed.status).toBe('error');
    expect(failed.migratedAt).toBeNull();
    expect(failed.lastError).toBe('网络错误');
    expect(afterOffline(initialSyncState).status).toBe('offline');
    expect(shouldMigrate(afterOffline(initialSyncState), true)).toBe(true);
  });
});
