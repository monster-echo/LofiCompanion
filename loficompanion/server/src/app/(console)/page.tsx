'use client';

import { Activity, Bell, ScrollText, ServerCog, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MagnitudeBarChart } from '@/components/charts/magnitude-bar-chart';
import { TrendAreaChart } from '@/components/charts/trend-area-chart';
import { adminFetch } from '@/lib/admin-fetch';
import { useResource } from '@/lib/use-resource';
import { formatNumber, formatRelativeTime } from '@/lib/format';
import type { LogSummary, Overview } from '@/lib/api-types';
import { useTenant } from '@/features/tenant/tenant-context';
import { ChartSkeleton, EmptyChart, MetricsSkeleton } from '@/features/console/chart-states';
import { PageHeader } from '@/features/console/page-header';
import { ResourceView } from '@/features/console/resource-view';
import { StatCard } from '@/features/console/stat-card';

export default function OverviewPage() {
  const { appId, environment, ready } = useTenant();
  const scope = { appId, environment };
  const metrics = useResource<Overview>(
    () => adminFetch('/api/v1/admin/metrics', scope),
    [appId, environment, ready],
  );
  const summary = useResource<LogSummary>(
    () => adminFetch('/api/v1/admin/logs/summary?since=1440', scope),
    [appId, environment, ready],
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="概览"
        description={`当前租户 ${appId} · ${environment}`}
      >
        <Badge variant="outline" className="gap-1.5">
          <ServerCog className="size-3.5" aria-hidden />
          配置 v{metrics.data?.configVersion ?? '—'}
        </Badge>
      </PageHeader>

      <ResourceView resource={metrics} skeleton={<MetricsSkeleton />}>
        {(data) => (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="注册用户"
              value={formatNumber(data.users)}
              icon={Users}
              hint={`有效会话 ${formatNumber(data.activeSessions)}`}
            />
            <StatCard
              label="在线会话"
              value={formatNumber(data.onlineSessions)}
              icon={Activity}
              hint={`在线用户 ${formatNumber(data.onlineUsers)}`}
            />
            <StatCard
              label="24 小时事件"
              value={formatNumber(data.events24h)}
              icon={ScrollText}
              hint={`活跃用户 ${formatNumber(data.activeUsers24h)}`}
            />
            <StatCard
              label="通知记录"
              value={formatNumber(data.notifications)}
              icon={Bell}
              hint={`最近事件 ${formatRelativeTime(data.lastEventAt)}`}
            />
          </div>
        )}
      </ResourceView>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>近 24 小时事件趋势</CardTitle>
            <CardDescription>按接收时间的小时聚合</CardDescription>
          </CardHeader>
          <CardContent>
            <ResourceView
              resource={summary}
              skeleton={<ChartSkeleton />}
              empty={<EmptyChart text="近 24 小时无事件" />}
            >
              {(data) => <TrendAreaChart data={data.series} label="事件数" />}
            </ResourceView>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>事件类型分布</CardTitle>
            <CardDescription>Top 8 事件名</CardDescription>
          </CardHeader>
          <CardContent>
            <ResourceView
              resource={summary}
              skeleton={<ChartSkeleton />}
              empty={<EmptyChart text="暂无事件" />}
            >
              {(data) => <MagnitudeBarChart data={data.byName} label="事件数" />}
            </ResourceView>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
