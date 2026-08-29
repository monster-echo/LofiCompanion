import { cn } from '@/lib/utils';

export function PageHeader({
  title,
  description,
  children,
  className,
}: Readonly<{
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}>) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="text-muted-foreground mt-1 text-sm">{description}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}
