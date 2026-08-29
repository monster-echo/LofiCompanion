'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  ChipMultiSelect,
  Field,
  NumberInput,
  SelectInput,
  SwitchInput,
  TextInput,
} from './controls';
import { ListEditor } from './list-editor';
import { SectionCard } from './sections-simple';
import {
  LEGAL_LOCALE_OPTIONS,
  LEGAL_TYPE_OPTIONS,
  LOCALE_OPTIONS,
  MUTABILITY_OPTIONS,
  PAYMENT_PROVIDER_OPTIONS,
  PLAN_INTERVAL_OPTIONS,
  VISIBILITY_OPTIONS,
} from './config-enums';

type Entitlement = { key: string; label: string; description: string };
type Tier = { id: string; name: string; summary: string; recommended: boolean; accent: string; entitlements: readonly string[] };
type Plan = { id: string; tierId: string; name: string; interval: string; priceMinor: number; currency: string; originalPriceMinor?: number; provider: string };
type LegalDoc = { type: string; locale: string; revision: string; title: string; content: string; requiresReconsent: boolean };
type SupportDoc = {
  enabled: boolean; market: string; dataRegion: string;
  categories: ReadonlyArray<Readonly<{ id: string; label: string }>>;
  queues: ReadonlyArray<Readonly<{ id: string; market: string; locales: readonly string[]; categories: readonly string[] }>>;
  help: ReadonlyArray<Readonly<{ id: string; locale: string; title: string; body: string }>>;
};
type SupportEdit = {
  enabled: boolean; market: string; dataRegion: string;
  categories: Array<{ id: string; label: string }>;
  queues: Array<{ id: string; market: string; locales: string[]; categories: string[] }>;
  help: Array<{ id: string; locale: string; title: string; body: string }>;
};

export function EntitlementsSection({
  entitlements,
  onChange,
}: Readonly<{ entitlements: ReadonlyArray<Readonly<Entitlement>>; onChange: (next: Entitlement[]) => void }>) {
  return (
    <SectionCard title="权益定义" description="可授予会员的权益项；会员等级通过引用这些 key 来组合权益。">
      <ListEditor
        items={entitlements as Entitlement[]}
        onChange={onChange}
        create={() => ({ key: `entitlement.${Date.now()}`, label: '新权益', description: '' })}
        getKey={(item) => item.key}
        itemTitle={(item) => item.label}
        addLabel="新增权益"
        render={(item, update) => (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Key" description="权益唯一标识，被会员等级引用。"><TextInput value={item.key} onChange={(v) => update({ key: v })} /></Field>
            <Field label="名称" description="展示给用户的权益名。"><TextInput value={item.label} onChange={(v) => update({ label: v })} /></Field>
            <Field label="说明" description="权益描述，展示在权益列表。" className="sm:col-span-2"><TextInput value={item.description} onChange={(v) => update({ description: v })} /></Field>
          </div>
        )}
      />
    </SectionCard>
  );
}

export function TiersSection({
  tiers,
  onChange,
  entitlementKeys,
}: Readonly<{ tiers: ReadonlyArray<Readonly<Tier>>; onChange: (next: Tier[]) => void; entitlementKeys: readonly string[] }>) {
  return (
    <SectionCard title="会员等级" description="Free/Pro/Team 等等级及其包含的权益组合与强调色。">
      <ListEditor
        items={tiers as Tier[]}
        onChange={onChange}
        create={() => ({ id: `tier-${Date.now()}`, name: '新等级', summary: '', recommended: false, accent: '#667085', entitlements: [] })}
        getKey={(item) => item.id}
        itemTitle={(item) => item.name}
        addLabel="新增等级"
        render={(item, update) => (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="ID" description="等级唯一标识。"><TextInput value={item.id} onChange={(v) => update({ id: v })} /></Field>
            <Field label="名称" description="展示名，如 Pro。"><TextInput value={item.name} onChange={(v) => update({ name: v })} /></Field>
            <Field label="简介" description="一句话卖点。" className="sm:col-span-2"><TextInput value={item.summary} onChange={(v) => update({ summary: v })} /></Field>
            <Field label="强调色" description="等级卡片强调色（十六进制）。"><TextInput value={item.accent} onChange={(v) => update({ accent: v })} /></Field>
            <Field label="推荐" description="是否标记为“推荐”等级。"><SwitchInput checked={item.recommended} onChange={(v) => update({ recommended: v })} /></Field>
            <Field label="包含权益" description="勾选该等级包含的权益项。" className="sm:col-span-2">
              <ChipMultiSelect options={entitlementKeys} selected={item.entitlements} onChange={(v) => update({ entitlements: v })} />
            </Field>
          </div>
        )}
      />
    </SectionCard>
  );
}

export function PlansSection({
  plans,
  onChange,
  tierIds,
}: Readonly<{ plans: ReadonlyArray<Readonly<Plan>>; onChange: (next: Plan[]) => void; tierIds: readonly string[] }>) {
  return (
    <SectionCard title="订阅方案" description="可购买的方案：归属等级、计费周期、价格（最小货币单位）与支付渠道。">
      <ListEditor
        items={plans as Plan[]}
        onChange={onChange}
        create={() => ({ id: `plan-${Date.now()}`, tierId: tierIds[0] ?? '', name: '新方案', interval: 'month', priceMinor: 0, currency: 'CNY', originalPriceMinor: 0, provider: 'mock' })}
        getKey={(item) => item.id}
        itemTitle={(item) => item.name}
        addLabel="新增方案"
        render={(item, update) => (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="ID" description="方案唯一标识。"><TextInput value={item.id} onChange={(v) => update({ id: v })} /></Field>
            <Field label="名称" description="展示名，如 Pro 月度。"><TextInput value={item.name} onChange={(v) => update({ name: v })} /></Field>
            <Field label="归属等级" description="该方案对应的会员等级。"><SelectInput value={item.tierId} onChange={(v) => update({ tierId: v })} options={tierIds.length ? tierIds : ['']} /></Field>
            <Field label="计费周期" description="month/year/lifetime/one_time。"><SelectInput value={item.interval} onChange={(v) => update({ interval: v })} options={PLAN_INTERVAL_OPTIONS} /></Field>
            <Field label="价格（最小单位）" description="整数最小货币单位，如分；1800=18.00 元。"><NumberInput value={item.priceMinor} onChange={(v) => update({ priceMinor: v })} /></Field>
            <Field label="原价（最小单位）" description="可选划线原价，0 表示不显示。"><NumberInput value={item.originalPriceMinor ?? 0} onChange={(v) => update({ originalPriceMinor: v })} /></Field>
            <Field label="货币" description="ISO 4217 货币码，如 CNY/USD。"><TextInput value={item.currency} onChange={(v) => update({ currency: v })} /></Field>
            <Field label="支付渠道" description="结算提供方。"><SelectInput value={item.provider} onChange={(v) => update({ provider: v })} options={PAYMENT_PROVIDER_OPTIONS} /></Field>
          </div>
        )}
      />
    </SectionCard>
  );
}

export function SupportSection({
  support,
  onChange,
}: Readonly<{ support: Readonly<SupportDoc>; onChange: (next: SupportEdit) => void }>) {
  const set = (patch: Partial<SupportEdit>) => onChange({ ...(support as unknown as SupportEdit), ...patch });
  const categoryIds = support.categories.map((c) => c.id);
  return (
    <SectionCard title="客户支持" description="工单分类、分派队列、帮助文章与数据归属区域。">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="启用支持" description="是否开放工单/反馈入口。"><SwitchInput checked={support.enabled} onChange={(v) => set({ enabled: v })} /></Field>
        <Field label="市场" description="目标市场标识，如 global / CN。"><TextInput value={support.market} onChange={(v) => set({ market: v })} /></Field>
        <Field label="数据区域" description="工单数据存放区域，如 us / cn。"><TextInput value={support.dataRegion} onChange={(v) => set({ dataRegion: v })} /></Field>
      </div>
      <Field label="工单分类" description="用户提交工单时可选的分类。">
        <ListEditor
          items={support.categories as unknown as Array<{ id: string; label: string }>}
          onChange={(categories) => set({ categories })}
          create={() => ({ id: `category-${Date.now()}`, label: '新分类' })}
          getKey={(item) => item.id}
          itemTitle={(item) => item.label}
          addLabel="新增分类"
          render={(item, update) => (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="ID" description="分类标识。"><TextInput value={item.id} onChange={(v) => update({ id: v })} /></Field>
              <Field label="名称" description="展示名。"><TextInput value={item.label} onChange={(v) => update({ label: v })} /></Field>
            </div>
          )}
        />
      </Field>
      <Field label="分派队列" description="按市场/语言/分类把工单路由到不同处理队列。">
        <ListEditor
          items={support.queues as unknown as Array<{ id: string; market: string; locales: string[]; categories: string[] }>}
          onChange={(queues) => set({ queues })}
          create={() => ({ id: `queue-${Date.now()}`, market: 'global', locales: ['zh-CN'], categories: [] })}
          getKey={(item) => item.id}
          itemTitle={(item) => `${item.id} · ${item.market}`}
          addLabel="新增队列"
          render={(item, update) => (
            <div className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="ID" description="队列标识。"><TextInput value={item.id} onChange={(v) => update({ id: v })} /></Field>
                <Field label="市场" description="匹配的市场。"><TextInput value={item.market} onChange={(v) => update({ market: v })} /></Field>
              </div>
              <Field label="语言" description="该队列服务的语言。"><ChipMultiSelect options={LOCALE_OPTIONS} selected={item.locales} onChange={(v) => update({ locales: v })} /></Field>
              <Field label="分类" description="该队列处理的工单分类。"><ChipMultiSelect options={categoryIds} selected={item.categories} onChange={(v) => update({ categories: v })} /></Field>
            </div>
          )}
        />
      </Field>
      <Field label="帮助文章" description="应用内帮助中心的常见问题。">
        <ListEditor
          items={support.help as unknown as Array<{ id: string; locale: string; title: string; body: string }>}
          onChange={(help) => set({ help })}
          create={() => ({ id: `help-${Date.now()}`, locale: 'zh-CN', title: '新帮助', body: '' })}
          getKey={(item) => item.id}
          itemTitle={(item) => `${item.title} (${item.locale})`}
          addLabel="新增帮助"
          render={(item, update) => (
            <div className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="ID" description="帮助文章标识。"><TextInput value={item.id} onChange={(v) => update({ id: v })} /></Field>
                <Field label="语言" description="该文案的语言。"><SelectInput value={item.locale} onChange={(v) => update({ locale: v })} options={LOCALE_OPTIONS} /></Field>
              </div>
              <Field label="标题" description="问题标题。"><TextInput value={item.title} onChange={(v) => update({ title: v })} /></Field>
              <Field label="正文" description="回答正文。"><Textarea value={item.body} onChange={(e) => update({ body: e.target.value })} className="min-h-24" /></Field>
            </div>
          )}
        />
      </Field>
    </SectionCard>
  );
}

export function LegalSection({
  legal,
  onChange,
}: Readonly<{ legal: ReadonlyArray<Readonly<LegalDoc>>; onChange: (next: LegalDoc[]) => void }>) {
  return (
    <SectionCard title="法务文档" description="隐私政策、用户协议、订阅说明；这些也会通过公开链接暴露给 App Store。">
      <ListEditor
        items={legal as LegalDoc[]}
        onChange={onChange}
        create={() => ({ type: 'privacy', locale: 'zh-CN', revision: new Date().toISOString().slice(0, 10), title: '新文档', content: '', requiresReconsent: false })}
        getKey={(item, index) => `${item.type}-${item.locale}-${index}`}
        itemTitle={(item) => `${item.title} (${item.type}/${item.locale})`}
        addLabel="新增文档"
        render={(item, update) => (
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="类型" description="privacy/terms/subscription。"><SelectInput value={item.type} onChange={(v) => update({ type: v })} options={LEGAL_TYPE_OPTIONS} /></Field>
              <Field label="语言" description="该文案语言。"><SelectInput value={item.locale} onChange={(v) => update({ locale: v })} options={LEGAL_LOCALE_OPTIONS} /></Field>
              <Field label="版本号" description="文档修订版本，如日期。"><TextInput value={item.revision} onChange={(v) => update({ revision: v })} /></Field>
            </div>
            <Field label="标题" description="文档标题。"><TextInput value={item.title} onChange={(v) => update({ title: v })} /></Field>
            <Field label="正文" description="文档正文（纯文本）。"><Textarea value={item.content} onChange={(e) => update({ content: e.target.value })} className="min-h-32 font-mono text-xs" /></Field>
            <Field label="需重新同意" description="变更后是否要求用户重新同意。"><SwitchInput checked={item.requiresReconsent} onChange={(v) => update({ requiresReconsent: v })} /></Field>
          </div>
        )}
      />
    </SectionCard>
  );
}

export function SettingsPolicySection({
  policy,
  onChange,
}: Readonly<{ policy: Readonly<Record<string, Readonly<{ visibility: string; mutability: string }>>>; onChange: (next: Record<string, { visibility: string; mutability: string }>) => void }>) {
  const entries = Object.entries(policy);
  const setEntry = (key: string, patch: Partial<{ visibility: string; mutability: string }>) =>
    onChange({ ...policy, [key]: { ...(policy[key] as { visibility: string; mutability: string }), ...patch } });
  const removeKey = (key: string) => {
    const next = { ...policy };
    delete next[key];
    onChange(next);
  };
  return (
    <SectionCard title="设置项策略" description="控制客户端各设置分组是否可见、是否允许用户修改。">
      <SettingsKeyAdder onAdd={(key) => { if (!(key in policy)) onChange({ ...policy, [key]: { visibility: 'visible', mutability: 'user' } }); }} />
      <div className="grid gap-2">
        {entries.map(([key, value]) => (
          <div key={key} className="grid grid-cols-1 items-center gap-2 rounded-md border px-3 py-2 sm:grid-cols-[1fr_10rem_10rem_auto]">
            <span className="truncate font-mono text-sm">{key}</span>
            <SelectInput value={value.visibility} onChange={(v) => setEntry(key, { visibility: v })} options={VISIBILITY_OPTIONS} />
            <SelectInput value={value.mutability} onChange={(v) => setEntry(key, { mutability: v })} options={MUTABILITY_OPTIONS} />
            <button type="button" onClick={() => removeKey(key)} className="text-muted-foreground hover:text-destructive text-xs">移除</button>
          </div>
        ))}
        {entries.length === 0 ? <p className="text-muted-foreground text-sm">暂无设置策略。</p> : null}
      </div>
    </SectionCard>
  );
}

function SettingsKeyAdder({ onAdd }: Readonly<{ onAdd: (key: string) => void }>) {
  const [draft, setDraft] = React.useState('');
  const commit = () => {
    const key = draft.trim();
    if (key) {
      onAdd(key);
      setDraft('');
    }
  };
  return (
    <div className="flex gap-2">
      <TextInput value={draft} onChange={setDraft} placeholder="设置分组 key，如 account.security" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }} />
      <Button type="button" variant="outline" size="sm" onClick={commit}>添加</Button>
    </div>
  );
}
