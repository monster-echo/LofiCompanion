'use client';

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

type Point = Readonly<{ bucket: string; count: number }>;

export function TrendAreaChart({
  data,
  label,
  colorVar = '--chart-1',
  height = 260,
}: Readonly<{
  data: readonly Point[];
  label: string;
  colorVar?: string;
  height?: number;
}>) {
  const config = { count: { label } } satisfies ChartConfig;
  const series = data.map((point) => ({ label: formatHour(point.bucket), count: point.count }));
  return (
    <ChartContainer config={config} className="w-full" style={{ height }}>
      <AreaChart data={series} margin={{ left: 4, right: 12, top: 8 }}>
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={`var(${colorVar})`} stopOpacity={0.35} />
            <stop offset="100%" stopColor={`var(${colorVar})`} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={28}
        />
        <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
        <ChartTooltip content={<ChartTooltipContent labelKey="label" />} />
        <Area
          dataKey="count"
          type="monotone"
          stroke={`var(${colorVar})`}
          strokeWidth={2}
          fill="url(#trendFill)"
          dot={false}
          activeDot={{ r: 4 }}
        />
      </AreaChart>
    </ChartContainer>
  );
}

function formatHour(bucket: string) {
  // bucket looks like "2026-07-30T12"
  if (bucket.length < 13) return bucket;
  return `${bucket.slice(5, 10)} ${bucket.slice(11, 13)}:00`;
}
