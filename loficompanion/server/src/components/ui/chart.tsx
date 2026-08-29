'use client';

import * as React from 'react';
import * as RechartsPrimitive from 'recharts';

import { cn } from '@/lib/utils';

const THEMES = { light: '', dark: '.dark' } as Record<string, string>;

export type ChartConfig = Partial<{
  [k: string]: {
    label?: React.ReactNode;
    icon?: React.ComponentType;
  } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: Record<keyof typeof THEMES, string> }
  );
}>;

type ChartContextProps = {
  config: ChartConfig;
};

const ChartContext = React.createContext<ChartContextProps | null>(null);

function useChart() {
  const context = React.useContext(ChartContext);
  if (!context) {
    throw new Error('useChart must be used within a <ChartContainer />');
  }
  return context;
}

function ChartContainer({
  id,
  className,
  children,
  config,
  ...props
}: React.ComponentProps<'div'> & {
  config: ChartConfig;
  children: React.ComponentProps<
    typeof RechartsPrimitive.ResponsiveContainer
  >['children'];
}) {
  const uniqueId = React.useId();
  const chartId = `chart-${id ?? uniqueId.replace(/:/g, '')}`;
  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-chart={chartId}
        className={cn(
          "flex aspect-auto justify-center text-xs",
          "[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground",
          "[&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/70",
          "[&_.recharts-curve.recharts-tooltip-cursor]:stroke-border",
          "[&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border",
          "[&_.recharts-dotsolid_circle]:fill-border",
          "group-not-data-[hidden]:flex",
          className,
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

function ChartStyle({ id, config }: { id: string; config: ChartConfig }) {
  const colorConfig = Object.entries(config).filter(
    ([, itemConfig]) => itemConfig && (itemConfig.theme || itemConfig.color),
  );
  if (!colorConfig.length) {
    return null;
  }

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: Object.entries(THEMES)
          .map(
            ([theme, prefix]) => `
${prefix} [data-chart=${id}] {
${colorConfig
  .map(([key, itemConfig]) => {
    const color =
      (itemConfig && itemConfig.theme?.[theme as keyof typeof THEMES]) ||
      itemConfig?.color;
    return color ? `  --color-${key}: ${color};` : null;
  })
  .filter(Boolean)
  .join('\n')}
}
`,
          )
          .join('\n'),
      }}
    />
  );
}

const ChartTooltip = RechartsPrimitive.Tooltip;

function ChartTooltipContent({
  active,
  payload,
  className,
  indicator = 'dot',
  hideLabel = false,
  nameKey,
  labelKey,
  labelFormatter,
  formatter,
}: {
  active?: boolean;
  payload?: ReadonlyArray<
    Readonly<{
      name?: string;
      value?: number | string;
      dataKey?: string | number;
      color?: string;
      payload?: Record<string, unknown>;
    }>
  >;
  className?: string;
  indicator?: 'line' | 'dot' | 'dashed';
  hideLabel?: boolean;
  nameKey?: string;
  labelKey?: string;
  labelFormatter?: (label: unknown, payload: unknown) => React.ReactNode;
  formatter?: (
    value: number | string,
    name: string,
    item: unknown,
    index: number,
  ) => React.ReactNode;
}) {
  const { config } = useChart();
  if (!active || !payload?.length) return null;

  const tooltipItems = payload.map((item, index) => {
    const key = `${nameKey ?? item.name ?? item.dataKey}`;
    const itemConfig = getChartConfigItem(config, item, key);
    const renderedValue = formatter
      ? formatter(item.value ?? '', item.name ?? '', item, index)
      : item.value;
    return (
      <div
        key={item.dataKey?.toString() ?? index}
        className="flex w-full flex-wrap items-stretch gap-2"
      >
        {indicator && (
          <span
            className={cn(
              'size-2.5 shrink-0 rounded-[2px]',
              indicator === 'line' && 'h-0.5 w-3 self-center rounded-full',
              indicator === 'dashed' &&
                'self-center border-t-2 border-dashed bg-transparent',
            )}
            style={
              indicator !== 'dashed'
                ? { backgroundColor: item.color }
                : { borderColor: item.color }
            }
          />
        )}
        <div className="flex flex-1 justify-between gap-2 leading-none">
          <span className="text-muted-foreground">
            {itemConfig?.label ?? item.name}
          </span>
          <span className="text-foreground font-mono font-medium tabular-nums">
            {renderedValue}
          </span>
        </div>
      </div>
    );
  });

  return (
    <div
      className={cn(
        'border-border/50 bg-background/95 grid min-w-(--bits-tooltip-content-available-width) origin-(--bits-tooltip-content-transform-origin) gap-1.5 rounded-md border px-2.5 py-1.5 text-xs shadow-xl backdrop-blur',
        className,
      )}
    >
      {!hideLabel && (
        <div className="text-foreground font-medium">
          {labelFormatter && payload[0]?.payload
            ? labelFormatter(
                (payload[0].payload as Record<string, unknown>)[labelKey ?? 'label'],
                payload,
              )
            : (payload[0]?.payload as Record<string, unknown>)?.[
                labelKey ?? 'label'
              ]?.toString() || payload[0]?.name}
        </div>
      )}
      {tooltipItems}
    </div>
  );
}

function getChartConfigItem(
  config: ChartConfig,
  item: { name?: string; dataKey?: string | number; payload?: Record<string, unknown> },
  key: string,
) {
  if (config[key]) return config[key];
  const fromPayload = Object.keys(config).find(
    (configKey) =>
      item.payload &&
      typeof item.payload === 'object' &&
      configKey in item.payload,
  );
  return fromPayload ? config[fromPayload] : undefined;
}

const ChartLegend = RechartsPrimitive.Legend;

function ChartLegendContent({
  className,
  hideIcon = false,
  nameKey,
  payload,
}: {
  className?: string;
  hideIcon?: boolean;
  nameKey?: string;
  payload?: ReadonlyArray<{
    value?: string;
    color?: string;
    dataKey?: string | number;
  }>;
}) {
  const { config } = useChart();
  if (!payload?.length) return null;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-center gap-4 [&>svg]:size-3',
        className,
      )}
    >
      {payload.map((item, index) => {
        const key = `${nameKey ?? item.value ?? item.dataKey}`;
        const itemConfig = getChartConfigItem(config, item, key);
        return (
          <div
            key={item.dataKey?.toString() ?? index}
            className="flex items-center gap-1.5"
          >
            {!hideIcon && item.color && (
              <span
                className="size-2 shrink-0 rounded-[2px]"
                style={{ backgroundColor: item.color }}
              />
            )}
            <span className="text-muted-foreground">
              {itemConfig?.label ?? item.value}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  ChartStyle,
};
