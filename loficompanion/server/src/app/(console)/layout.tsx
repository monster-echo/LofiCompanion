import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/console/app-shell';
import { TenantProvider } from '@/features/tenant/tenant-context';
import { ADMIN_COOKIE, getAdminByToken } from '@/server/admin-identity';

export const dynamic = 'force-dynamic';

export default async function ConsoleLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;
  const session = token ? await getAdminByToken(token) : null;
  if (!session) redirect('/login');

  return (
    <TenantProvider appId={session.appId}>
      <AppShell admin={session.admin}>{children}</AppShell>
    </TenantProvider>
  );
}
