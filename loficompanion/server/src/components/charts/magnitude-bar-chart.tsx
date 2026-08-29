'use client';

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

type Datum = Readonly<{ key: string; count: number }>;

export function MagnitudeBarChart({
  data,
  label,
  colorVar = '--chart-1',
  height = 260,
}: Readonly<{
  data: readonly Datum[];
  label: string;
  colorVar?: string;
  height?: number;
}>) {
  const config = { count: { label } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="w-full" style={{ height }}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4 }}>
        <CartesianGrid vertical={false} horizontal={false} />
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="key"
          tickLine={false}
          axisLine={false}
          width={120}
        />
        <ChartTooltip content={<ChartTooltipContent labelKey="key" />} />
        <Bar dataKey="count" fill={`var(${colorVar})`} radius={4} maxBarSize={22} />
      </BarChart>
    </ChartContainer>
  );
}
