import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiClientError } from '../../../data/apiClient';
import { i18n } from '../../../i18n/core';

export type LoadState<T> =
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'error'; message: string; code: string | null }>
  | Readonly<{ status: 'ready'; data: T }>;

export function errorMessageOf(error: unknown): { message: string; code: string | null } {
  if (error instanceof ApiClientError) return { message: error.message, code: error.code };
  if (error instanceof ApiClientError && error.messageKey) {
    return { message: i18n.t(`errors:${error.messageKey}`), code: error.code };
  }
  return { message: error instanceof Error ? error.message : i18n.t('errors:loadFailed'), code: null };
}

/**
 * 榜单/小组数据拉取（doc-08 §21 反馈与系统状态）：初始 loading → ready/error；
 * 失败整页 error 态 + 重试；RefreshControl 下拉刷新时保留旧数据（refreshing）。
 * poll（后台定时轮询）与两者都不同：不亮任何刷新指示、数据未变不触发重渲染、
 * 失败静默保留已有数据——轮询是数据面的后台刷新，绝不能有「整页刷新」观感
 * （此前自习室 15s 轮询误用 refresh，每 15s 转一次下拉刷新菊花）。
 */

/** 数据面浅比较（数组元素逐键 ===）：内容相同则 poll 返回原 state 引用，
 *  React 直接跳过重渲染。仅覆盖轮询载荷形态（对象/扁平对象数组）。 */
function sameData<T>(a: T, b: T): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => sameData(item, b[i]));
  }
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    const ka = Object.keys(a as Record<string, unknown>);
    const kb = Object.keys(b as Record<string, unknown>);
    return ka.length === kb.length
      && ka.every((key) => (a as Record<string, unknown>)[key] === (b as Record<string, unknown>)[key]);
  }
  return false;
}

export function useAsyncRefresh<T>(loader: () => Promise<T>, deps: readonly unknown[]) {
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  // 在飞互斥：同一 loader 上一次请求未完成时不重复发起（poll 与 refresh 并发）
  const inFlight = useRef(false);

  const run = useCallback(async (mode: 'load' | 'refresh' | 'poll') => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (mode === 'refresh') setRefreshing(true);
    else if (mode === 'load') setState({ status: 'loading' });
    try {
      const data = await loaderRef.current();
      if (mode === 'poll') {
        setState((prev) => (
          prev.status === 'ready' && sameData(prev.data, data)
            ? prev
            : { status: 'ready', data }
        ));
      } else {
        setState({ status: 'ready', data });
      }
    } catch (error) {
      if (mode === 'poll') {
        // 后台轮询失败：已有数据时静默保留，整页 error 态只留给首屏加载
        setState((prev) => (
          prev.status === 'ready'
            ? prev
            : { status: 'error', ...errorMessageOf(error) }
        ));
      } else {
        const { message, code } = errorMessageOf(error);
        setState({ status: 'error', message, code });
      }
    } finally {
      if (mode === 'refresh') setRefreshing(false);
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    void run('load');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const reload = useCallback(() => run('load'), [run]);
  const refresh = useCallback(() => run('refresh'), [run]);
  const poll = useCallback(() => run('poll'), [run]);
  return { state, refreshing, reload, refresh, poll };
}
