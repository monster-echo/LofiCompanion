import { NextRequest } from 'next/server';
import { adminContext } from '@/server/admin-auth';
import { handleError, ok } from '@/server/http';
import { getOverview } from '@/server/metrics-repository';

export async function GET(request: NextRequest) {
  try {
    const { scope } = await adminContext(request);
    return ok(await getOverview(scope));
  } catch (error) {
    return handleError(error);
  }
}
