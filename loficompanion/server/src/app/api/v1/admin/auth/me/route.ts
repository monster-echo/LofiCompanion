import { NextRequest } from 'next/server';
import { getAdminFromRequest } from '@/server/admin-identity';
import { ApiError, handleError, ok } from '@/server/http';

export async function GET(request: NextRequest) {
  try {
    const session = await getAdminFromRequest(request);
    if (!session) throw new ApiError(401, 'UNAUTHENTICATED', '未登录');
    return ok({ ...session.admin, appId: session.appId });
  } catch (error) {
    return handleError(error);
  }
}
