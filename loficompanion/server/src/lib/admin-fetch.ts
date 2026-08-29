import type { TenantScope } from '@/features/tenant/tenant-context';

export type ApiEnvelope<T> = Readonly<{
  data?: T;
  error?: Readonly<{ code: string; message: string; retryable?: boolean }>;
}>;

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export function adminHeaders(scope: TenantScope, hasBody = false): Record<string, string> {
  return {
    'x-admin-actor': 'control-plane-ui',
    'x-app-id': scope.appId,
    'x-app-environment': scope.environment,
    ...(hasBody ? { 'content-type': 'application/json' } : {}),
  };
}

export async function adminFetch<T>(
  path: string,
  scope: TenantScope,
  init?: RequestInit,
): Promise<T> {
  const hasBody = Boolean(init?.body);
  const response = await fetch(path, {
    ...init,
    headers: { ...adminHeaders(scope, hasBody), ...init?.headers },
  });
  const body = (await response.json().catch(() => ({}))) as ApiEnvelope<T>;
  if (!response.ok || body.error) {
    throw new ApiRequestError(
      response.status,
      body.error?.code ?? 'REQUEST_FAILED',
      body.error?.message ?? '请求失败，请稍后重试',
    );
  }
  return body.data as T;
}

export async function safeAdminFetch<T>(
  path: string,
  scope: TenantScope,
  init?: RequestInit,
): Promise<Readonly<{ data: T | null; error: string | null }>> {
  try {
    const data = await adminFetch<T>(path, scope, init);
    return { data, error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : '请求失败',
    };
  }
}
