import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiClientError } from '../../../data/apiClient';

export type LoadState<T> =
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'error'; message: string; code: string | null }>
  | Readonly<{ status: 'ready'; data: T }>;

export function errorMessageOf(error: unknown): { message: string; code: string | null } {
  if (error instanceof ApiClientError) return { message: error.message, code: error.code };
  return { message: error instanceof Error ? error.message : '加载失败', code: null };
}

/**
 * 榜单/小组数据拉取（doc-08 §21 反馈与系统状态）：初始 loading → ready/error；
 * 失败整页 error 态 + 重试；RefreshControl 下拉刷新时保留旧数据（refreshing）。
 */
export function useAsyncRefresh<T>(loader: () => Promise<T>, deps: readonly unknown[]) {
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const run = useCallback(async (mode: 'load' | 'refresh') => {
    if (mode === 'refresh') setRefreshing(true);
    else setState({ status: 'loading' });
    try {
      const data = await loaderRef.current();
      setState({ status: 'ready', data });
    } catch (error) {
      const { message, code } = errorMessageOf(error);
      setState({ status: 'error', message, code });
    } finally {
      if (mode === 'refresh') setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void run('load');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const reload = useCallback(() => run('load'), [run]);
  const refresh = useCallback(() => run('refresh'), [run]);
  return { state, refreshing, reload, refresh };
}
