'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { routes } from '@/lib/routes';
import type { AdminProfile } from '@/lib/api-types';
import { TenantSwitcher } from '@/features/tenant/tenant-switcher';
import { ThemeToggle } from './theme-toggle';
import { brandIcon as BrandIcon, navItems } from './nav-items';

export function AppShell({
  admin,
  children,
}: Readonly<{ admin: AdminProfile; children: React.ReactNode }>) {
  const pathname = usePathname();
  return (
    <div className="bg-background text-foreground flex min-h-svh">
      <aside className="bg-sidebar text-sidebar-foreground border-sidebar-border hidden w-64 shrink-0 flex-col border-r md:flex">
        <BrandHeader />
        <nav className="flex flex-col gap-1 p-3">
          {navItems.map((item) => (
            <SidebarLink
              key={item.href}
              item={item}
              active={isActive(pathname, item.href)}
            />
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-background/80 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b px-4 py-3 backdrop-blur">
          <MobileBrand />
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <TenantSwitcher />
            <ThemeToggle />
            <AdminMenu admin={admin} />
          </div>
        </header>
        <nav className="border-sidebar-border bg-sidebar/40 flex gap-1 overflow-x-auto px-3 py-2 md:hidden">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap',
                isActive(pathname, item.href)
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-muted-foreground',
              )}
            >
              <item.icon className="size-4" aria-hidden />
              {item.label}
            </Link>
          ))}
        </nav>
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}

function BrandHeader() {
  return (
    <Link href={routes.overview} className="flex items-center gap-2.5 px-5 py-5">
      <span className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-lg">
        <BrandIcon className="size-5" aria-hidden />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-sm font-semibold">终北统一认证</span>
        <span className="text-muted-foreground text-xs">运行时控制台</span>
      </span>
    </Link>
  );
}

function MobileBrand() {
  return (
    <Link href={routes.overview} className="flex items-center gap-2 md:hidden">
      <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg">
        <BrandIcon className="size-4" aria-hidden />
      </span>
      <span className="text-sm font-semibold">控制台</span>
    </Link>
  );
}

function SidebarLink({
  item,
  active,
}: Readonly<{ item: (typeof navItems)[number]; active: boolean }>) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      title={item.description}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'hover:bg-sidebar-accent/60 text-sidebar-foreground/80',
      )}
    >
      <Icon className="size-4" aria-hidden />
      {item.label}
    </Link>
  );
}

function AdminMenu({ admin }: Readonly<{ admin: AdminProfile }>) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  const signOut = async () => {
    setBusy(true);
    try {
      await fetch('/api/v1/admin/auth/logout', { method: 'POST' });
    } finally {
      router.push('/login');
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Avatar className="size-6">
            <AvatarFallback className="text-xs">{admin.username.slice(0, 1).toUpperCase()}</AvatarFallback>
          </Avatar>
          <span className="max-w-[8rem] truncate">{admin.username}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="text-muted-foreground font-normal">{admin.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={signOut} disabled={busy} className="gap-2">
          <LogOut className="size-4" /> 登出
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function isActive(pathname: string, href: string) {
  if (href === routes.overview) return pathname === routes.overview;
  return pathname === href || pathname.startsWith(`${href}/`);
}
