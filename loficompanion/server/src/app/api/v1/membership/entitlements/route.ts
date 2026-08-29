import { NextRequest } from 'next/server';
import { requireAuth } from '@/server/auth';
import { handleError, ok } from '@/server/http';
import { listActiveEntitlements } from '@/server/entitlement-service';

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const entitlements = await listActiveEntitlements(user.id, user.app_id);
    return ok({ keys: entitlements.map((e) => e.entitlement_key) });
  } catch (error) {
    return handleError(error);
  }
}
