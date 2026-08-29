'use client';

import * as React from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Search,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MagnitudeBarChart } from '@/components/charts/magnitude-bar-chart';
import { TrendAreaChart } from '@/components/charts/trend-area-chart';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { adminFetch } from '@/lib/admin-fetch';
import { formatDateTime, formatNumber } from '@/lib/format';
import type { LogRow, LogSummary } from '@/lib/api-types';
import { useResource } from '@/lib/use-resource';
import { useTenant } from '@/features/tenant/tenant-context';
import { ChartSkeleton, EmptyChart } from '@/features/console/chart-states';
import { PageHeader } from '@/features/console/page-header';
import { ResourceView } from '@/features/console/resource-view';

const PAGE_SIZE = 50;
const SINCE_OPTIONS = [
  { label: '近 1 小时', value: 60 },
  { label: '近 24 小时', value: 1440 },
  { label: '近 7 天', value: 10080 },
] as const;

export function LogsPanel() {
  const { appId, environment, ready } = useTenant();
  const scope = React.useMemo(() => ({ appId, environment }), [appId, environment]);
  const [since, setSince] = React.useState<number>(1440);
  const [name, setName] = React.useState('');
  const [platform, setPlatform] = React.useState('');
  const [offset, setOffset] = React.useState(0);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  const resetFilters = (patch: { since?: number; name?: string; platform?: string }) => {
    setOffset(0);
    if (patch.since !== undefined) setSince(patch.since);
    if (patch.name !== undefined) setName(patch.name);
    if (patch.platform !== undefined) setPlatform(patch.platform);
  };

  const summary = useResource<LogSummary>(
    () => adminFetch(`/api/v1/admin/logs/summary?since=${since}`, scope),
    [appId, environment, ready, since],
  );
  const logs = useResource<{ rows: readonly LogRow[] }>(
    () => adminFetch(`/api/v1/admin/logs?limit=${PAGE_SIZE}&offset=${offset}&since=${since}${query('name', name)}${query('platform', platform)}`, scope),
    [appId, environment, ready, since, name, platform, offset],
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="日志与分析" description={`遥测事件检索与趋势分析 · ${appId}`} />

      <Card>
        <CardHeader className="border-b">
          <CardTitle>事件趋势</CardTitle>
          <CardDescription>按接收时间小时聚合</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <ResourceView resource={summary} skeleton={<ChartSkeleton />} empty={<EmptyChart text="所选时间范围内无事件" />}>
            {(data) => (
              <div className="grid gap-6 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <TrendAreaChart data={data.series} label="事件数" height={240} />
                </div>
                <div>
                  <p className="text-muted-foreground mb-2 text-xs">事件总数 {formatNumber(data.total)}</p>
                  <MagnitudeBarChart data={data.byName.slice(0, 6)} label="次数" colorVar="--chart-2" height={240} />
                </div>
              </div>
            )}
          </ResourceView>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>事件列表</CardTitle>
          <CardDescription>支持按事件名与平台筛选</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={String(since)} onValueChange={(value) => resetFilters({ since: Number(value) })}>
              <SelectTrigger size="sm" className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SINCE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={String(option.value)}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FilterSelect
              placeholder="全部事件"
              value={name}
              options={summary.data?.names ?? []}
              onChange={(value) => resetFilters({ name: value })}
            />
            <FilterSelect
              placeholder="全部平台"
              value={platform}
              options={summary.data?.platforms ?? []}
              onChange={(value) => resetFilters({ platform: value })}
            />
            {(name || platform || since !== 1440) && (
              <Button variant="ghost" size="sm" onClick={() => { setName(''); setPlatform(''); setSince(1440); setOffset(0); }}>
                清除筛选
              </Button>
            )}
          </div>

          <ResourceView resource={logs} empty={<EmptyChart text="没有匹配的事件" height={160} />}>
            {({ rows }) => (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>时间</TableHead>
                    <TableHead>事件</TableHead>
                    <TableHead>屏幕</TableHead>
                    <TableHead>平台</TableHead>
                    <TableHead>版本</TableHead>
                    <TableHead>访客</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const expanded = expandedId === row.eventId;
                    return (
                      <React.Fragment key={row.eventId}>
                        <TableRow>
                          <TableCell className="text-muted-foreground whitespace-nowrap">
                            {formatDateTime(row.receivedAt)}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-auto gap-2 px-0 font-medium"
                              aria-expanded={expanded}
                              onClick={() => setExpandedId(expanded ? null : row.eventId)}
                            >
                              {row.name === 'app_error' ? (
                                <AlertTriangle className="size-4 text-destructive" />
                              ) : null}
                              {row.name}
                              {expanded
                                ? <ChevronUp className="size-3.5 opacity-50" />
                                : <ChevronDown className="size-3.5 opacity-50" />}
                            </Button>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{row.screenId ?? '—'}</TableCell>
                          <TableCell><Badge variant="secondary">{row.platform}</Badge></TableCell>
                          <TableCell className="text-muted-foreground font-mono text-xs">{row.appVersion}</TableCell>
                          <TableCell className="text-muted-foreground whitespace-nowrap text-xs">
                            {visitorLabel(row)}
                          </TableCell>
                        </TableRow>
                        {expanded ? <LogDetailRow row={row} /> : null}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </ResourceView>

          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-xs">第 {offset + 1} 条起，每页 {PAGE_SIZE} 条</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={offset === 0 || logs.status === 'loading'} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} className="gap-1">
                <ChevronLeft className="size-4" /> 上一页
              </Button>
              <Button variant="outline" size="sm" disabled={logs.status === 'loading'} onClick={() => setOffset(offset + PAGE_SIZE)} className="gap-1">
                下一页 <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function LogDetailRow({ row }: Readonly<{ row: LogRow }>) {
  const properties = Object.entries(row.properties);
  return (
    <TableRow className="bg-muted/30 hover:bg-muted/30">
      <TableCell colSpan={6} className="p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Detail label="事件 ID" value={row.eventId} mono />
          <Detail label="发生时间" value={formatDateTime(row.occurredAt)} />
          {properties.map(([key, value]) => (
            <Detail
              key={key}
              label={propertyLabel(key)}
              value={String(value)}
              mono={key === 'error_name'}
              wide={key === 'error_message'}
            />
          ))}
          {!properties.length ? (
            <p className="text-muted-foreground text-sm md:col-span-2">该事件没有附加属性。</p>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}

function Detail({
  label, value, mono = false, wide = false,
}: Readonly<{ label: string; value: string; mono?: boolean; wide?: boolean }>) {
  return (
    <div className={wide ? 'md:col-span-2' : undefined}>
      <p className="text-muted-foreground mb-1 text-xs">{label}</p>
      <p className={`break-words text-sm whitespace-pre-wrap ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </p>
    </div>
  );
}

function propertyLabel(key: string) {
  return {
    error_name: '错误类型',
    error_message: '错误信息',
    error_stack: '调用栈',
    duration_ms: '停留时间（毫秒）',
    screen_id: '屏幕标识',
    action_id: '操作标识',
  }[key] ?? key;
}

function visitorLabel(row: LogRow) {
  return row.userId
    ? `用户 · ${row.userId.slice(0, 8)}`
    : `匿名访客 · ${row.anonymousId.slice(-6)}`;
}

function FilterSelect({
  placeholder, value, options, onChange,
}: Readonly<{ placeholder: string; value: string; options: readonly string[]; onChange: (value: string) => void }>) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" className="w-40 gap-2">
        <Search className="size-3.5 opacity-50" />
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="">{placeholder}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option} value={option}>{option}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function query(key: string, value: string) {
  return value ? `&${key}=${encodeURIComponent(value)}` : '';
}
