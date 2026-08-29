'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { RotateCcw, Save, Send } from 'lucide-react';
import type { RuntimeConfig } from '@/domain/config';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { adminFetch } from '@/lib/admin-fetch';
import { formatDateTime } from '@/lib/format';
import { useTenant } from '@/features/tenant/tenant-context';
import { PageHeader } from '@/features/console/page-header';
import {
  AuthSection, BasicSection, BrandSection, FeaturesSection, SplashSection, TelemetrySection,
} from './sections-simple';
import {
  EntitlementsSection, LegalSection, PlansSection, SettingsPolicySection, SupportSection, TiersSection,
} from './sections-collections';
import { AuditTable, RevisionTable, type AuditEntry, type Revision } from './config-history';

type Envelope = Readonly<{ published: RuntimeConfig; draft: RuntimeConfig | null }>;
type Tab = 'ui' | 'json' | 'revisions' | 'audit';
type Phase = 'idle' | 'loading' | 'busy' | 'error';

export function ConfigConsole() {
  const { appId, environment, ready } = useTenant();
  const scope = React.useMemo(() => ({ appId, environment }), [appId, environment]);

  const [doc, setDoc] = React.useState<RuntimeConfig | null>(null);
  const [jsonText, setJsonText] = React.useState('');
  const [jsonError, setJsonError] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<Tab>('ui');
  const [phase, setPhase] = React.useState<Phase>('idle');
  const [message, setMessage] = React.useState('读取当前租户的运行时配置。');
  const [hasDraft, setHasDraft] = React.useState(false);
  const [revisions, setRevisions] = React.useState<readonly Revision[]>([]);
  const [audit, setAudit] = React.useState<readonly AuditEntry[]>([]);
  const [confirm, setConfirm] = React.useState<null | 'publish'>(null);
  const [rollbackVersion, setRollbackVersion] = React.useState('');

  const loadAll = React.useCallback(async () => {
    setPhase('loading');
    try {
      const [envelope, history] = await Promise.all([
        adminFetch<Envelope>('/api/v1/admin/config', scope),
        adminFetch<{ revisions: readonly Revision[]; audit: readonly AuditEntry[] }>(
          '/api/v1/admin/config/revisions',
          scope,
        ),
      ]);
      const current = envelope.draft ?? envelope.published;
      setDoc(current);
      setJsonText(JSON.stringify(current, null, 2));
      setJsonError(null);
      setHasDraft(Boolean(envelope.draft));
      setRevisions(history.revisions);
      setAudit(history.audit);
      setMessage(envelope.draft ? '已载入未发布草稿。' : '已载入当前发布版本。');
      setPhase('idle');
    } catch (error) {
      setPhase('error');
      setMessage(errorMessage(error));
    }
  }, [scope]);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial config load driven by tenant scope
    if (ready) void loadAll();
  }, [loadAll, ready]);

  const update = (patch: Partial<RuntimeConfig>) => setDoc((prev) => (prev ? { ...prev, ...patch } : prev));

  const applyJson = () => {
    try {
      const parsed = JSON.parse(jsonText) as RuntimeConfig;
      setDoc(parsed);
      setJsonError(null);
      toast.success('JSON 已应用到表单');
      return true;
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : 'JSON 解析失败');
      return false;
    }
  };

  const onTabChange = (value: string) => {
    const next = value as Tab;
    if (tab === 'json' && next !== 'json') {
      if (!applyJson()) {
        toast.error('JSON 解析失败，请先修正再切换标签');
        return;
      }
    }
    if (next === 'json' && doc) setJsonText(JSON.stringify(doc, null, 2));
    setTab(next);
  };

  const saveDraft = async () => {
    if (!doc) return;
    setPhase('busy');
    try {
      await adminFetch('/api/v1/admin/config', scope, { method: 'PUT', body: JSON.stringify(doc) });
      toast.success('草稿已保存', { description: '客户端配置尚未改变，需发布后生效。' });
      await loadAll();
    } catch (error) {
      toast.error('保存失败', { description: errorMessage(error) });
      setPhase('error');
    }
  };

  const publish = async () => {
    setPhase('busy');
    try {
      await adminFetch('/api/v1/admin/config/publish', scope, { method: 'POST' });
      toast.success('草稿已发布', { description: '客户端将在刷新策略触发后获取新版本。' });
      await loadAll();
    } catch (error) {
      toast.error('发布失败', { description: errorMessage(error) });
      setPhase('error');
    }
  };

  const rollback = async () => {
    const version = Number(rollbackVersion);
    if (!version) return;
    setPhase('busy');
    try {
      await adminFetch('/api/v1/admin/config/rollback', scope, {
        method: 'POST',
        body: JSON.stringify({ version }),
      });
      toast.success(`已恢复至版本 ${version}`, { description: '已生成新的发布版本。' });
      setRollbackVersion('');
      await loadAll();
    } catch (error) {
      toast.error('回滚失败', { description: errorMessage(error) });
      setPhase('error');
    }
  };

  const busy = phase === 'busy' || phase === 'loading';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="多租户配置" description={`运行时配置可视化与 JSON 双编辑 · ${appId} · ${environment}`}>
        <Badge variant={hasDraft ? 'warning' : 'secondary'}>{hasDraft ? '有未发布草稿' : '无草稿'}</Badge>
      </PageHeader>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>配置文档</CardTitle>
          <CardDescription>可视化表单与 JSON 代码双向同步；保存为草稿后发布到当前环境。</CardDescription>
          <CardAction>
            <Button variant="outline" size="sm" onClick={() => void loadAll()} disabled={busy}>读取</Button>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-6">
          <Tabs value={tab} onValueChange={onTabChange}>
            <TabsList>
              <TabsTrigger value="ui">可视化</TabsTrigger>
              <TabsTrigger value="json">JSON</TabsTrigger>
              <TabsTrigger value="revisions">版本历史</TabsTrigger>
              <TabsTrigger value="audit">审计日志</TabsTrigger>
            </TabsList>

            <TabsContent value="ui" className="mt-4">
              {phase === 'loading' || !doc ? (
                <Skeleton className="h-96 w-full" />
              ) : (
                <div className="flex flex-col gap-6">
                  <BasicSection schemaVersion={doc.schemaVersion} version={doc.version} cacheTtl={doc.cacheTtlSeconds} onCacheTtl={(v) => update({ cacheTtlSeconds: v })} />
                  <BrandSection brand={doc.brand} onChange={(brand) => update({ brand })} />
                  <SplashSection splash={doc.splash} onChange={(splash) => update({ splash })} />
                  <TelemetrySection telemetry={doc.telemetry} onChange={(telemetry) => update({ telemetry: telemetry as RuntimeConfig['telemetry'] })} />
                  <FeaturesSection features={doc.features} onChange={(features) => update({ features })} />
                  <AuthSection providers={doc.auth.providers} onChange={(providers) => update({ auth: { ...doc.auth, providers: providers as RuntimeConfig['auth']['providers'] } })} />
                  <EntitlementsSection entitlements={doc.entitlements} onChange={(entitlements) => update({ entitlements })} />
                  <TiersSection tiers={doc.tiers} onChange={(tiers) => update({ tiers })} entitlementKeys={doc.entitlements.map((e) => e.key)} />
                  <PlansSection plans={doc.plans} onChange={(plans) => update({ plans: plans as RuntimeConfig['plans'] })} tierIds={doc.tiers.map((t) => t.id)} />
                  <SupportSection support={doc.support} onChange={(support) => update({ support: support as RuntimeConfig['support'] })} />
                  <LegalSection legal={doc.legal} onChange={(legal) => update({ legal: legal as RuntimeConfig['legal'] })} />
                  <SettingsPolicySection policy={doc.settingsPolicy} onChange={(settingsPolicy) => update({ settingsPolicy: settingsPolicy as RuntimeConfig['settingsPolicy'] })} />
                </div>
              )}
            </TabsContent>

            <TabsContent value="json" className="mt-4 flex flex-col gap-3">
              <Textarea
                value={jsonText}
                onChange={(event) => setJsonText(event.target.value)}
                spellCheck={false}
                className="min-h-[460px] font-mono text-xs"
              />
              {jsonError ? <p className="text-destructive text-sm">{jsonError}</p> : null}
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={applyJson}>应用到表单</Button>
                <p className="text-muted-foreground text-xs">切换到「可视化」标签时会自动校验并应用 JSON。</p>
              </div>
            </TabsContent>

            <TabsContent value="revisions" className="mt-4"><RevisionTable revisions={revisions} /></TabsContent>
            <TabsContent value="audit" className="mt-4"><AuditTable audit={audit} /></TabsContent>
          </Tabs>

          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            <Button onClick={saveDraft} disabled={busy || !doc} className="gap-2"><Save className="size-4" /> 保存草稿</Button>
            <Button onClick={() => setConfirm('publish')} disabled={busy || !hasDraft} className="gap-2"><Send className="size-4" /> 发布</Button>
            <Button variant="outline" onClick={() => setRollbackVersion(revisions[0]?.version.toString() ?? '')} disabled={busy || revisions.length === 0} className="gap-2"><RotateCcw className="size-4" /> 回滚</Button>
            <p className="text-muted-foreground ml-auto text-sm" role="status">{message}</p>
          </div>
        </CardContent>
      </Card>

      <Dialog open={confirm === 'publish'} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>发布配置草稿？</DialogTitle>
            <DialogDescription>发布后客户端将在刷新策略触发后获取新版本，并生成新的配置版本。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">取消</Button></DialogClose>
            <DialogClose asChild><Button onClick={publish}>确认发布</Button></DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rollbackVersion !== ''} onOpenChange={(open) => !open && setRollbackVersion('')}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>回滚到历史版本</DialogTitle>
            <DialogDescription>选择要恢复的版本，将以其内容生成新的发布版本。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="rollback-version">目标版本</Label>
            <Select value={rollbackVersion} onValueChange={setRollbackVersion}>
              <SelectTrigger id="rollback-version" className="w-full"><SelectValue placeholder="选择版本" /></SelectTrigger>
              <SelectContent>
                {revisions.map((revision) => (
                  <SelectItem key={revision.version} value={revision.version.toString()}>
                    v{revision.version} · {revision.action} · {formatDateTime(revision.createdAt)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">取消</Button></DialogClose>
            <DialogClose asChild><Button variant="destructive" onClick={rollback} disabled={!rollbackVersion}>确认回滚</Button></DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '操作失败';
}
