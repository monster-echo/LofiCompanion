'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import type { AdminProfile } from '@/lib/api-types';

type Status = Readonly<{
  loaded: boolean;
  adminExists: boolean;
  admin: AdminProfile | null;
  appIds: readonly string[];
}>;

export default function RegisterPage() {
  const router = useRouter();
  const [status, setStatus] = React.useState<Status>({
    loaded: false,
    adminExists: false,
    admin: null,
    appIds: [],
  });
  const [form, setForm] = React.useState({ username: '', email: '', password: '', appId: '' });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch('/api/v1/admin/auth/status')
      .then((response) => response.json())
      .then((body) =>
        setStatus({
          loaded: true,
          adminExists: body.data.adminExists,
          admin: body.data.admin,
          appIds: body.data.appIds ?? [],
        }),
      );
  }, []);

  const update = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/admin/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      });
      const body = await response.json();
      if (!response.ok || body.error) throw new Error(body.error?.message ?? '注册失败');
      if (body.data.autoLogin) {
        toast.success('管理员已创建', { description: '已自动登录，正在进入控制台。' });
        router.replace('/');
        router.refresh();
      } else {
        toast.success('新管理员已创建', { description: body.data.profile.username });
        setForm((prev) => ({ ...prev, username: '', email: '', password: '' }));
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '注册失败');
    } finally {
      setBusy(false);
    }
  };

  if (!status.loaded) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (status.adminExists && !status.admin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>注册已关闭</CardTitle>
          <CardDescription>系统已有管理员，新账号需由现有管理员登录后创建。</CardDescription>
        </CardHeader>
        <CardFooter className="mt-4">
          <Button asChild className="w-full"><Link href="/login">前往登录</Link></Button>
        </CardFooter>
      </Card>
    );
  }

  const bootstrap = !status.adminExists;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-5" aria-hidden />
          {bootstrap ? '创建首个管理员' : '邀请新管理员'}
        </CardTitle>
        <CardDescription>
          {bootstrap
            ? '首个管理员创建后将自动登录并进入控制台。'
            : `以 ${status.admin?.username} 身份创建新管理员。`}
        </CardDescription>
      </CardHeader>
      <form onSubmit={submit}>
        <CardContent className="flex flex-col gap-3">
          {bootstrap ? (
            <div className="grid gap-1.5">
              <Label htmlFor="appId">App ID（租户）</Label>
              <Input
                id="appId"
                list="app-id-options"
                value={form.appId}
                onChange={update('appId')}
                placeholder="如 zhongbei"
                autoComplete="off"
              />
              <datalist id="app-id-options">
                {status.appIds.map((id) => <option key={id} value={id} />)}
              </datalist>
            </div>
          ) : null}
          <Field id="username" label="用户名" value={form.username} onChange={update('username')} autoComplete="username" />
          <Field id="email" label="邮箱" type="email" value={form.email} onChange={update('email')} autoComplete="email" />
          <Field id="password" label="密码" type="password" value={form.password} onChange={update('password')} autoComplete="new-password" />
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </CardContent>
        <CardFooter className="mt-4 flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={busy}>{bootstrap ? '创建并登录' : '创建管理员'}</Button>
          <p className="text-muted-foreground text-center text-xs">
            已有账号？
            <Link href="/login" className="text-primary underline">直接登录</Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}

function Field({
  id, label, type = 'text', value, onChange, autoComplete,
}: Readonly<{
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  autoComplete?: string;
}>) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} onChange={onChange} autoComplete={autoComplete} />
    </div>
  );
}
