'use client';

import { Activity, AppWindow, ArrowRight, CheckCircle2, ScrollText, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { adminFetch } from '@/lib/admin-fetch';
import { useResource } from '@/lib/use-resource';
import { formatNumber, formatRelativeTime } from '@/lib/format';
import type { AppSummary } from '@/lib/api-types';
import { useTenant } from '@/features/tenant/tenant-context';
import { PageHeader } from '@/features/console/page-header';
import { ResourceView } from '@/features/console/resource-view';

export default function AppsPage() {
  const { appId, environment, ready, setScope } = useTenant();
  const scope = { appId, environment };
  const apps = useResource<{ apps: readonly AppSummary[] }>(
    () => adminFetch('/api/v1/admin/apps', scope),
    [appId, environment, ready],
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="应用管理"
        description={`当前登录绑定的应用与环境：${appId}。`}
      />
      <ResourceView resource={apps}>
        {(data) => (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.apps.map((app) => {
              const active = app.appId === appId;
              return (
                <Card key={app.appId} className={active ? 'border-primary' : undefined}>
                  <CardHeader className="border-b">
                    <CardTitle className="flex items-center gap-2">
                      <AppWindow className="size-4" aria-hidden />
                      <span className="font-mono">{app.appId}</span>
                    </CardTitle>
                    <CardDescription>
                      {app.environments.length ? '已配置环境' : '未配置环境'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4 pt-6">
                    <div className="flex flex-wrap gap-1.5">
                      {app.environments.length ? (
                        app.environments.map((env) => (
                          <Badge key={env} variant={env === environment && active ? 'default' : 'secondary'} className="capitalize">
                            {env}
                          </Badge>
                        ))
                      ) : (
                        <Badge variant="outline">无</Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <MiniStat icon={Users} label="用户" value={formatNumber(app.users)} />
                      <MiniStat icon={ScrollText} label="24h 事件" value={formatNumber(app.events24h)} />
                      <MiniStat icon={Activity} label="在线" value={formatNumber(app.online)} />
                    </div>
                    <p className="text-muted-foreground text-xs">最近活跃 {formatRelativeTime(app.lastSeenAt)}</p>
                    <Button
                      variant={active ? 'secondary' : 'outline'}
                      size="sm"
                      className="gap-2"
                      disabled={active}
                      onClick={() => setScope({ appId: app.appId })}
                    >
                      {active ? (
                        <><CheckCircle2 className="size-4" /> 当前租户</>
                      ) : (
                        <>切换到此租户 <ArrowRight className="size-4" /></>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </ResourceView>
    </div>
  );
}

function MiniStat({
  icon: Icon, label, value,
}: Readonly<{ icon: typeof Users; label: string; value: string }>) {
  return (
    <div className="bg-muted/40 rounded-lg py-2">
      <Icon className="text-muted-foreground mx-auto size-4" aria-hidden />
      <div className="mt-1 text-sm font-semibold tabular-nums">{value}</div>
      <div className="text-muted-foreground text-[10px]">{label}</div>
    </div>
  );
}
