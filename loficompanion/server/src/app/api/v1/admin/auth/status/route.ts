import { NextRequest } from 'next/server';
import { adminExists, getAdminFromRequest } from '@/server/admin-identity';
import { listAppIds } from '@/server/tenant-repository';
import { handleError, ok } from '@/server/http';

export async function GET(request: NextRequest) {
  try {
    const session = await getAdminFromRequest(request);
    return ok({
      adminExists: await adminExists(),
      admin: session ? { ...session.admin, appId: session.appId } : null,
      appIds: await listAppIds(),
    });
  } catch (error) {
    return handleError(error);
  }
}
