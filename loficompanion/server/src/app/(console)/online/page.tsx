'use client';

import { Activity, Clock, History, UserCheck, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { TrendAreaChart } from '@/components/charts/trend-area-chart';
import { adminFetch } from '@/lib/admin-fetch';
import { useResource } from '@/lib/use-resource';
import { formatDateTime, formatNumber, formatRelativeTime } from '@/lib/format';
import type { OnlineStats } from '@/lib/api-types';
import { useTenant } from '@/features/tenant/tenant-context';
import { ChartSkeleton, EmptyChart, MetricsSkeleton } from '@/features/console/chart-states';
import { PageHeader } from '@/features/console/page-header';
import { ResourceView } from '@/features/console/resource-view';
import { StatCard } from '@/features/console/stat-card';

export default function OnlinePage() {
  const { appId, environment, ready } = useTenant();
  const scope = { appId, environment };
  const stats = useResource<OnlineStats>(
    () => adminFetch('/api/v1/admin/online', scope),
    [appId, environment, ready],
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="在线人数"
        description={`近 5 分钟活跃会话 · ${appId} · ${environment}`}
      />

      <ResourceView resource={stats} skeleton={<MetricsSkeleton />}>
        {(data) => (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="在线会话" value={formatNumber(data.onlineSessions)} icon={Activity} hint="近 5 分钟有活动" />
            <StatCard label="在线用户" value={formatNumber(data.onlineUsers)} icon={UserCheck} hint="去重后的用户数" />
            <StatCard label="有效会话" value={formatNumber(data.activeSessions)} icon={Users} hint="未撤销且未过期" />
            <StatCard label="历史会话" value={formatNumber(data.totalSessions)} icon={History} hint="累计会话总数" />
          </div>
        )}
      </ResourceView>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>活跃会话趋势</CardTitle>
          <CardDescription>近 24 小时按 last_seen 小时聚合</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <ResourceView resource={stats} skeleton={<ChartSkeleton />} empty={<EmptyChart text="近 24 小时无活跃会话" />}>
            {(data) => <TrendAreaChart data={data.series} label="会话数" colorVar="--chart-3" />}
          </ResourceView>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>在线会话列表</CardTitle>
          <CardDescription>最多展示 100 条</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <ResourceView resource={stats} empty={<EmptyChart text="当前没有在线会话" height={160} />}>
            {(data) => (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>设备</TableHead>
                    <TableHead>用户</TableHead>
                    <TableHead>最近活跃</TableHead>
                    <TableHead>登录时间</TableHead>
                    <TableHead>过期时间</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.sessions.map((session) => (
                    <TableRow key={session.id}>
                      <TableCell className="font-medium">{session.deviceName}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {session.username ?? session.userId.slice(0, 8)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{formatRelativeTime(session.lastSeenAt)}</TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">{formatDateTime(session.createdAt)}</TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="size-3" /> {formatDateTime(session.expiresAt)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </ResourceView>
        </CardContent>
      </Card>
    </div>
  );
}
