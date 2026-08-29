'use client';

import * as React from 'react';

export type TenantScope = Readonly<{ appId: string; environment: string }>;

export const ENVIRONMENTS = ['development', 'staging', 'production'] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

const STORAGE_KEY = 'mobileui.console.environment';
const DEFAULT_ENVIRONMENT = 'development';

type TenantContextValue = TenantScope & {
  ready: boolean;
  setScope: (patch: Partial<TenantScope>) => void;
};

const TenantContext = React.createContext<TenantContextValue | null>(null);

/**
 * The app_id is fixed by the server from the login session and cannot be
 * switched from the UI; only the environment (release lane) is selectable.
 */
export function TenantProvider({
  appId,
  children,
}: Readonly<{ appId: string; children: React.ReactNode }>) {
  const [environment, setEnvironment] = React.useState<string>(DEFAULT_ENVIRONMENT);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- one-time hydration from external localStorage */
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored && (ENVIRONMENTS as readonly string[]).includes(stored)) {
        setEnvironment(stored);
      }
    } catch {
      /* ignore malformed storage */
    }
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const setScope = React.useCallback((patch: Partial<TenantScope>) => {
    if (patch.environment !== undefined) {
      setEnvironment(patch.environment);
      try {
        window.localStorage.setItem(STORAGE_KEY, patch.environment);
      } catch {
        /* storage unavailable, keep in-memory */
      }
    }
  }, []);

  const value = React.useMemo<TenantContextValue>(
    () => ({ appId, environment, ready, setScope }),
    [appId, environment, ready, setScope],
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant(): TenantContextValue {
  const ctx = React.useContext(TenantContext);
  if (!ctx) throw new Error('useTenant must be used within a TenantProvider');
  return ctx;
}
