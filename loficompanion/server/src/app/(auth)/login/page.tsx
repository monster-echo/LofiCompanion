'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [appId, setAppId] = React.useState('');
  const [appIds, setAppIds] = React.useState<readonly string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch('/api/v1/admin/auth/status')
      .then((response) => response.json())
      .then((body) => {
        setAppIds(body.data?.appIds ?? []);
        if (body.data?.admin) router.replace('/');
      });
  }, [router]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/admin/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ identifier, password, appId }),
      });
      const body = await response.json();
      if (!response.ok || body.error) {
        throw new Error(body.error?.message ?? '登录失败');
      }
      router.replace('/');
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '登录失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>登录控制台</CardTitle>
        <CardDescription>选择要管理的 app_id，使用管理员账号登录；登录后仅能查看该 app 的数据。</CardDescription>
      </CardHeader>
      <form onSubmit={submit}>
        <CardContent className="flex flex-col gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="appId">App ID（租户）</Label>
            <Input
              id="appId"
              list="app-id-options"
              value={appId}
              onChange={(event) => setAppId(event.target.value)}
              placeholder="如 zhongbei"
              autoComplete="off"
            />
            <datalist id="app-id-options">
              {appIds.map((id) => <option key={id} value={id} />)}
            </datalist>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="identifier">账号</Label>
            <Input
              id="identifier"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              autoComplete="username"
              placeholder="用户名或邮箱"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="password">密码</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </div>
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </CardContent>
        <CardFooter className="mt-4 flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={busy}>登录</Button>
          <p className="text-muted-foreground text-center text-xs">
            还没有管理员账号？
            <Link href="/register" className="text-primary underline">注册首个管理员</Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
