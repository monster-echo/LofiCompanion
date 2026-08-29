import { NextRequest } from 'next/server';
import { requireAuth } from '@/server/auth';
import { exportAccountData } from '@/server/account-export';
import { handleError, ok } from '@/server/http';

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    return ok(await exportAccountData(user.id));
  } catch (error) {
    return handleError(error);
  }
}
