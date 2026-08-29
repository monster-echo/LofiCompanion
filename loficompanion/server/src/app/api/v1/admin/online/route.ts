import { NextRequest } from 'next/server';
import { adminContext } from '@/server/admin-auth';
import { handleError, ok } from '@/server/http';
import { getOnlineStats } from '@/server/session-repository';

export async function GET(request: NextRequest) {
  try {
    const { scope } = await adminContext(request);
    return ok(await getOnlineStats(scope));
  } catch (error) {
    return handleError(error);
  }
}
