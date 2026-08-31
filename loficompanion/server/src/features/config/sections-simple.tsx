'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChipMultiSelect,
  ColorInput,
  Field,
  NumberInput,
  SelectInput,
  SwitchInput,
  TextInput,
} from './controls';
import { ListEditor } from './list-editor';
import {
  AUTH_PROVIDER_OPTIONS,
  FIREBASE_MODE_OPTIONS,
  PLATFORM_OPTIONS,
} from './config-enums';

export function SectionCard({
  title,
  description,
  children,
}: Readonly<{ title: string; description?: string; children: React.ReactNode }>) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="grid gap-4 pt-6">{children}</CardContent>
    </Card>
  );
}

export function BasicSection({
  schemaVersion,
  version,
  cacheTtl,
  onCacheTtl,
}: Readonly<{ schemaVersion: number; version: number; cacheTtl: number; onCacheTtl: (v: number) => void }>) {
  return (
    <SectionCard title="基础信息" description="配置文档的版本与客户端缓存策略。">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Schema 版本" description="配置结构版本，由系统维护，用于配置升级。">
          <TextInput value={String(schemaVersion)} onChange={() => {}} disabled />
        </Field>
        <Field label="已发布版本" description="当前发布版本号，每次发布会自增。">
          <TextInput value={`v${version}`} onChange={() => {}} disabled />
        </Field>
        <Field label="客户端缓存秒数" htmlFor="cacheTtl" description="客户端拉取配置后的本地缓存时长（秒），到期前不会重新请求。">
          <NumberInput id="cacheTtl" value={cacheTtl} onChange={onCacheTtl} />
        </Field>
      </div>
    </SectionCard>
  );
}

export function BrandSection({
  brand,
  onChange,
}: Readonly<{ brand: Readonly<{ appName: string; tagline: string; primaryColor: string }>; onChange: (next: { appName: string; tagline: string; primaryColor: string }) => void }>) {
  return (
    <SectionCard title="品牌" description="应用名称、标语与主题色，决定客户端展示的品牌形象。">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="应用名称" htmlFor="appName" description="展示在启动页、个人中心等处的产品名。">
          <TextInput id="appName" value={brand.appName} onChange={(v) => onChange({ ...brand, appName: v })} />
        </Field>
        <Field label="标语" htmlFor="tagline" description="一句话产品定位，常用于启动页/空状态。">
          <TextInput id="tagline" value={brand.tagline} onChange={(v) => onChange({ ...brand, tagline: v })} />
        </Field>
      </div>
      <Field label="主题色" htmlFor="primaryColor" description="客户端主色调（按钮、强调态），十六进制颜色。">
        <ColorInput id="primaryColor" value={brand.primaryColor} onChange={(v) => onChange({ ...brand, primaryColor: v })} />
      </Field>
    </SectionCard>
  );
}

/** 客户端语义色板键 → 中文标签（与服务端 ThemeColorKey / 客户端 ThemeColors 一致）。 */
const THEME_COLOR_LABELS: Readonly<Record<string, string>> = {
  background: '页面背景',
  surface: '卡片表面',
  surfaceRaised: '卡片浮起',
  surfaceMuted: '凹陷表面',
  text: '主文字',
  textSecondary: '次级文字',
  border: '边框',
  brand: '主色',
  brandPressed: '主色按压',
  brandSoft: '主色弱化底',
  success: '成功',
  warning: '警示',
  warningSoft: '警示弱化底',
  error: '危险',
  info: '信息',
  membershipBronze: '会员·铜',
  membershipSilver: '会员·银',
  membershipGold: '会员·金',
  scrim: '遮罩',
};

/** rgba 字段不适合取色器（type=color 只认 #RRGGBB），用文本框编辑。 */
const THEME_RGBA_KEYS = new Set(['border', 'brandSoft', 'warningSoft', 'scrim']);

export function ThemeSection({
  theme,
  onChange,
}: Readonly<{ theme: Readonly<Record<string, string>>; onChange: (next: Record<string, string>) => void }>) {
  return (
    <SectionCard title="客户端颜色系统" description="整套语义色板随配置下发到客户端（按钮、错误、成功等全部跟随）；留空键由服务端默认值补齐。">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(THEME_COLOR_LABELS).map(([key, label]) => (
          <Field
            key={key}
            label={label}
            htmlFor={`theme-${key}`}
            description={THEME_RGBA_KEYS.has(key) ? 'rgba(r,g,b,a) 半透明色。' : undefined}
          >
            {THEME_RGBA_KEYS.has(key) ? (
              <TextInput id={`theme-${key}`} value={theme[key] ?? ''} onChange={(v) => onChange({ ...theme, [key]: v })} />
            ) : (
              <ColorInput id={`theme-${key}`} value={theme[key] ?? '#000000'} onChange={(v) => onChange({ ...theme, [key]: v })} />
            )}
          </Field>
        ))}
      </div>
    </SectionCard>
  );
}

type SplashShape = Readonly<{
  id: string;
  title: string;
  description: string;
  badge: string;
  actionLabel: string;
  imageUrl: string | null;
  videoUrl: string | null;
  linkUrl: string | null;
  skippable: boolean;
  durationSeconds: number;
}>;

const DEFAULT_SPLASH: SplashShape = {
  id: 'splash',
  title: '',
  description: '',
  badge: '',
  actionLabel: '开始探索',
  imageUrl: null,
  videoUrl: null,
  linkUrl: null,
  skippable: true,
  durationSeconds: 5,
};

export function SplashSection({
  splash,
  onChange,
}: Readonly<{
  splash: SplashShape | null;
  onChange: (next: SplashShape | null) => void;
}>) {
  const set = (patch: Partial<SplashShape>) => onChange({ ...(splash ?? DEFAULT_SPLASH), ...patch });
  const enabled = splash !== null;
  return (
    <SectionCard title="启动页活动" description="App 启动时的闪屏活动卡片内容与展示时长。关闭则客户端 bootstrap 完成直接进首页，不展示闪屏。">
      <Field label="启用启动页闪屏" description="关闭后客户端拉取配置后直接进入首页。">
        <SwitchInput checked={enabled} onChange={(v) => onChange(v ? DEFAULT_SPLASH : null)} />
      </Field>
      {enabled && splash ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="活动 ID" htmlFor="splashId" description="活动唯一标识，用于上报与下线。"><TextInput id="splashId" value={splash.id} onChange={(v) => set({ id: v })} /></Field>
            <Field label="角标" htmlFor="splashBadge" description="左上角小标签，如“本周精选”。"><TextInput id="splashBadge" value={splash.badge} onChange={(v) => set({ badge: v })} /></Field>
          </div>
          <Field label="标题" htmlFor="splashTitle" description="活动主标题。"><TextInput id="splashTitle" value={splash.title} onChange={(v) => set({ title: v })} /></Field>
          <Field label="描述" htmlFor="splashDesc" description="活动正文说明。"><TextInput id="splashDesc" value={splash.description} onChange={(v) => set({ description: v })} /></Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="按钮文案" htmlFor="splashAction" description="主行动按钮的文字。"><TextInput id="splashAction" value={splash.actionLabel} onChange={(v) => set({ actionLabel: v })} /></Field>
            <Field label="展示时长（秒）" htmlFor="splashDur" description="自动消失前展示的秒数。"><NumberInput id="splashDur" value={splash.durationSeconds} onChange={(v) => set({ durationSeconds: v })} /></Field>
            <Field label="可跳过" description="允许用户点击跳过闪屏。"><SwitchInput checked={splash.skippable} onChange={(v) => set({ skippable: v })} /></Field>
          </div>
          <Field label="图片 URL" htmlFor="splashImg" description="活动配图地址，留空则不显示图片。"><TextInput id="splashImg" value={splash.imageUrl ?? ''} onChange={(v) => set({ imageUrl: v || null })} /></Field>
          <Field label="视频 URL" htmlFor="splashVideo" description="可选，开屏视频地址（如 mp4），配置后优先于图片。"><TextInput id="splashVideo" value={splash.videoUrl ?? ''} onChange={(v) => set({ videoUrl: v || null })} /></Field>
          <Field label="落地页 URL" htmlFor="splashLink" description="可选，点击闪屏跳转的落地页；未配置则点击无跳转（合规：仅按钮可点）。"><TextInput id="splashLink" value={splash.linkUrl ?? ''} onChange={(v) => set({ linkUrl: v || null })} /></Field>
        </>
      ) : null}
    </SectionCard>
  );
}

export function TelemetrySection({
  telemetry,
  onChange,
}: Readonly<{
  telemetry: Readonly<{ enabled: boolean; backendEnabled: boolean; firebaseMode: string; analyticsEnabled: boolean; crashlyticsEnabled: boolean }>;
  onChange: (next: { enabled: boolean; backendEnabled: boolean; firebaseMode: string; analyticsEnabled: boolean; crashlyticsEnabled: boolean }) => void;
}>) {
  const set = (patch: Partial<{ enabled: boolean; backendEnabled: boolean; firebaseMode: string; analyticsEnabled: boolean; crashlyticsEnabled: boolean }>) => onChange({ ...telemetry, ...patch });
  return (
    <SectionCard title="遥测与分析" description="数据上报总开关、后端转发与 Firebase 分析/崩溃的接入方式。">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="启用遥测" description="客户端是否采集并上报事件；关闭则全部停止。"><SwitchInput checked={telemetry.enabled} onChange={(v) => set({ enabled: v })} /></Field>
        <Field label="后端转发" description="将事件上报到本服务端（/api/v1/telemetry）。"><SwitchInput checked={telemetry.backendEnabled} onChange={(v) => set({ backendEnabled: v })} /></Field>
        <Field label="Firebase 分析" description="开启 Firebase Analytics 事件上报。"><SwitchInput checked={telemetry.analyticsEnabled} onChange={(v) => set({ analyticsEnabled: v })} /></Field>
        <Field label="崩溃上报" description="开启 Firebase Crashlytics 崩溃采集。"><SwitchInput checked={telemetry.crashlyticsEnabled} onChange={(v) => set({ crashlyticsEnabled: v })} /></Field>
      </div>
      <Field label="Firebase 模式" description="disabled=不接入；client_direct=客户端直连；server_forwarded=经服务端转发。">
        <SelectInput value={telemetry.firebaseMode} onChange={(v) => set({ firebaseMode: v })} options={FIREBASE_MODE_OPTIONS} />
      </Field>
    </SectionCard>
  );
}

export function FeaturesSection({
  features,
  onChange,
}: Readonly<{ features: Readonly<Record<string, boolean>>; onChange: (next: Record<string, boolean>) => void }>) {
  const entries = Object.entries(features);
  const setKey = (key: string, value: boolean) => onChange({ ...features, [key]: value });
  const removeKey = (key: string) => {
    const next = { ...features };
    delete next[key];
    onChange(next);
  };
  return (
    <SectionCard title="功能开关" description="按 key 控制客户端功能模块的显隐；key 自定义，值为开/关。">
      <FeatureKeyAdder onAdd={(key) => { if (!(key in features)) onChange({ ...features, [key]: false }); }} />
      <div className="grid gap-2 sm:grid-cols-2">
        {entries.map(([key, value]) => (
          <div key={key} className="flex items-center justify-between rounded-md border px-3 py-2">
            <div className="min-w-0">
              <div className="truncate font-mono text-sm">{key}</div>
              <div className="text-muted-foreground text-xs">功能标识</div>
            </div>
            <div className="flex items-center gap-2">
              <SwitchInput checked={value} onChange={(v) => setKey(key, v)} />
              <button type="button" onClick={() => removeKey(key)} className="text-muted-foreground hover:text-destructive text-xs">移除</button>
            </div>
          </div>
        ))}
        {entries.length === 0 ? <p className="text-muted-foreground text-sm">暂无功能开关。</p> : null}
      </div>
    </SectionCard>
  );
}

export function AuthSection({
  providers,
  onChange,
}: Readonly<{
  providers: ReadonlyArray<Readonly<{ id: string; enabled: boolean; platforms: readonly string[] }>>;
  onChange: (next: Array<{ id: string; enabled: boolean; platforms: string[] }>) => void;
}>) {
  return (
    <SectionCard title="认证提供方" description="各登录方式（密码/手机/Apple/Google/GitHub/微信）的启用状态与可用平台。第三方 clientIds 请在 JSON 标签编辑。">
      <ListEditor
        items={providers as Array<{ id: string; enabled: boolean; platforms: string[] }>}
        onChange={onChange}
        create={() => ({ id: AUTH_PROVIDER_OPTIONS[0], enabled: true, platforms: [...PLATFORM_OPTIONS] })}
        getKey={(item) => item.id}
        itemTitle={(item) => item.id}
        addLabel="新增提供方"
        render={(item, update) => (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="提供方" description="登录方式标识。"><SelectInput value={item.id} onChange={(v) => update({ id: v })} options={AUTH_PROVIDER_OPTIONS} /></Field>
            <Field label="启用" description="是否在登录页展示该提供方。"><SwitchInput checked={item.enabled} onChange={(v) => update({ enabled: v })} /></Field>
            <Field label="可用平台" description="该提供方在哪些客户端平台显示。" className="sm:col-span-2">
              <ChipMultiSelect options={PLATFORM_OPTIONS} selected={item.platforms} onChange={(v) => update({ platforms: v })} />
            </Field>
          </div>
        )}
      />
    </SectionCard>
  );
}

function FeatureKeyAdder({ onAdd }: Readonly<{ onAdd: (key: string) => void }>) {
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
      <Input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="功能 key，如 membership.newFlow"
        onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commit(); } }}
      />
      <Button type="button" variant="outline" size="sm" onClick={commit}>添加</Button>
    </div>
  );
}
