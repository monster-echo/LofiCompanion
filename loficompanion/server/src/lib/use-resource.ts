'use client';

import { useCallback, useEffect, useState } from 'react';

export type ResourceStatus = 'idle' | 'loading' | 'success' | 'error';

export type Resource<T> = {
  status: ResourceStatus;
  data: T | null;
  error: string | null;
  reload: () => void;
};

type State<T> = { status: ResourceStatus; data: T | null; error: string | null };

/**
 * Fetches data via `loader`, re-running whenever `deps` change or `reload` is
 * called. State updates happen only in async resolution callbacks, so the hook
 * follows a stale-while-revalidate model: previously loaded data stays visible
 * until the next request resolves.
 */
export function useResource<T>(
  loader: () => Promise<T>,
  deps: readonly unknown[],
): Resource<T> {
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<State<T>>({
    status: 'idle',
    data: null,
    error: null,
  });
  const reload = useCallback(() => setTick((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    loader()
      .then((data) => {
        if (active) setState({ status: 'success', data, error: null });
      })
      .catch((error) => {
        if (active) {
          setState({
            status: 'error',
            data: null,
            error: error instanceof Error ? error.message : '请求失败',
          });
        }
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { ...state, reload };
}
