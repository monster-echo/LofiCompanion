import { NextRequest } from 'next/server';
import { adminContext } from '@/server/admin-auth';
import { listConfigAudit, listConfigRevisions } from '@/server/config-control';
import { handleError, ok } from '@/server/http';

export async function GET(request: NextRequest) {
  try {
    const { scope } = await adminContext(request);
    return ok({ revisions: await listConfigRevisions(scope), audit: await listConfigAudit(scope) });
  } catch (error) {
    return handleError(error);
  }
}
