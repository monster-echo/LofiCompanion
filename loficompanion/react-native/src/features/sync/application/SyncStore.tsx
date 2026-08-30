import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import { AppState } from 'react-native';
import { apiClient } from '../../../data/apiClient';
import { useApp } from '../../../state/AppStore';
import {
  afterMigrationSuccess, afterOffline, afterSyncFailure,
  initialSyncState, shouldMigrate, toMigrationPayload,
  type SyncState,
} from '../domain/syncEngine';

// 同步编排：登录后一次性迁移 + 手动/前后台触发补同步。
// 客户端 local-first：任何失败都不阻塞本地闭环（P0-A 行为完全保留）。

const MIGRATED_AT_KEY = 'lofi.sync.migratedAt';
const HISTORY_KEY = 'lofi.focus.history';

interface SyncApi {
  state: SyncState;
  syncNow: () => Promise<void>;
}

const SyncContext = createContext<SyncApi | null>(null);

export function SyncProvider(props: { children: React.ReactNode }) {
  const { user } = useApp();
  const [state, setState] = useState<SyncState>(initialSyncState);
  const isLoggedIn = user !== null;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
      const raw = await AsyncStorage.getItem(MIGRATED_AT_KEY);
      if (!cancelled && raw) {
        setState((prev) => ({ ...prev, migratedAt: Number(raw) || null }));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const syncNow = useCallback(async () => {
    setState((prev) => ({ ...prev, status: 'syncing' }));
    try {
      const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
      const [rawMigratedAt, historyJson] = await Promise.all([
        AsyncStorage.getItem(MIGRATED_AT_KEY),
        AsyncStorage.getItem(HISTORY_KEY),
      ]);
      if (rawMigratedAt) {
        setState((prev) => ({ ...prev, migratedAt: Number(rawMigratedAt) || null }));
      }
      const isLoggedInNow = user !== null;
      if (!isLoggedInNow) {
        setState((prev) => afterOffline(prev));
        return;
      }
      const migratedAt = rawMigratedAt ? Number(rawMigratedAt) : null;
      if (shouldMigrate({ ...initialSyncState, migratedAt }, true)) {
        const history = historyFromJson(historyJson);
        const payload = history.map((doc) => toMigrationPayload(doc));
        const result = await apiClient.migrateGuestSessions(payload);
        const now = Date.now();
        await AsyncStorage.setItem(MIGRATED_AT_KEY, String(now));
        setState((prev) => afterMigrationSuccess(prev, history.map((doc) => doc.clientRequestId), now));
        void result;
      } else {
        setState((prev) => ({ ...prev, status: 'synced' }));
      }
    } catch (error) {
      setState((prev) => afterSyncFailure(prev, error instanceof Error ? error.message : '同步失败'));
    }
  }, [user]);

  // 登录后自动一次性迁移
  useEffect(() => {
    if (isLoggedIn && state.migratedAt === null && state.status !== 'syncing') {
      void syncNow();
    }
  }, [isLoggedIn, state.migratedAt, state.status, syncNow]);

  // 前后台切换时补同步
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void syncNow();
    });
    return () => sub.remove();
  }, [syncNow]);

  const value = useMemo(() => ({ state, syncNow }), [state, syncNow]);
  return <SyncContext.Provider value={value}>{props.children}</SyncContext.Provider>;
}

export function useSync(): SyncApi {
  const value = useContext(SyncContext);
  if (!value) throw new Error('useSync 必须在 SyncProvider 内使用');
  return value;
}

function historyFromJson(raw: string | null): Array<Parameters<typeof toMigrationPayload>[0]> {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as Array<Parameters<typeof toMigrationPayload>[0]>) : [];
  } catch {
    return [];
  }
}
