import { NextRequest } from 'next/server';
import { authorizeAdmin } from '@/server/admin-auth';
import { handleError, ok } from '@/server/http';
import { listApps } from '@/server/tenant-repository';

export async function GET(request: NextRequest) {
  try {
    const { appId } = await authorizeAdmin(request);
    return ok({ apps: (await listApps()).filter((app) => app.appId === appId) });
  } catch (error) {
    return handleError(error);
  }
}
