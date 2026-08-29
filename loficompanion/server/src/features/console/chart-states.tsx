import { Skeleton } from '@/components/ui/skeleton';

export function ChartSkeleton({ height = 260 }: Readonly<{ height?: number }>) {
  return <Skeleton className="w-full" style={{ height }} />;
}

export function EmptyChart({
  text,
  height = 260,
}: Readonly<{ text: string; height?: number }>) {
  return (
    <div
      className="text-muted-foreground flex items-center justify-center text-sm"
      style={{ height }}
    >
      {text}
    </div>
  );
}

export function MetricsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton key={index} className="h-28 w-full" />
      ))}
    </div>
  );
}
