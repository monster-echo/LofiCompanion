import { NextRequest } from 'next/server';
import { clearAdminCookie } from '@/server/admin-auth';
import { ADMIN_COOKIE, revokeSession } from '@/server/admin-identity';
import { handleError, ok } from '@/server/http';

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(ADMIN_COOKIE)?.value;
    if (token) await revokeSession(token);
    await clearAdminCookie();
    return ok({ loggedOut: true });
  } catch (error) {
    return handleError(error);
  }
}
