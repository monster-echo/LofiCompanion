'use client';

import * as React from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { Resource } from '@/lib/use-resource';

export function ResourceView<T>({
  resource,
  skeleton,
  empty,
  children,
}: Readonly<{
  resource: Resource<T>;
  skeleton?: React.ReactNode;
  empty?: React.ReactNode;
  children: (data: T) => React.ReactNode;
}>) {
  if (resource.status === 'idle' || resource.status === 'loading') {
    return <>{skeleton ?? <DefaultSkeleton />}</>;
  }
  if (resource.status === 'error') {
    return <ErrorBlock message={resource.error} onRetry={resource.reload} />;
  }
  if (resource.data == null || (Array.isArray(resource.data) && resource.data.length === 0)) {
    return <>{empty ?? <EmptyBlock />}</>;
  }
  return <>{children(resource.data as T)}</>;
}

function DefaultSkeleton() {
  return (
    <div className="grid gap-3">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function ErrorBlock({
  message,
  onRetry,
}: Readonly<{ message: string | null; onRetry: () => void }>) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
      <p className="text-destructive text-sm font-medium">数据加载失败</p>
      <p className="text-muted-foreground max-w-md text-sm">{message ?? '未知错误'}</p>
      <Button variant="outline" size="sm" onClick={onRetry} className="gap-2">
        <RefreshCw className="size-4" /> 重试
      </Button>
    </div>
  );
}

function EmptyBlock() {
  return (
    <div className="rounded-lg border border-dashed p-10 text-center">
      <p className="text-muted-foreground text-sm">当前租户暂无数据</p>
    </div>
  );
}
