import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import {
  ADMIN_COOKIE,
  ADMIN_SESSION_TTL_MS,
  getAdminFromRequest,
  type AdminProfile,
  type AdminSession,
} from './admin-identity';
import { ApiError } from './http';

export type { AdminProfile, AdminSession } from './admin-identity';
export { ADMIN_COOKIE, ADMIN_SESSION_TTL_MS } from './admin-identity';

export type AdminScope = Readonly<{ appId: string; environment: string }>;

const HEADER_ADMIN: AdminProfile = {
  id: 'admin-key',
  username: 'admin-key',
  email: '',
  createdAt: '',
};

/**
 * Authorizes a control-plane request and returns the session's bound app_id.
 * Prefers a valid admin cookie session (whose app_id is fixed at login); in
 * non-production an `x-admin-key` header is still accepted, taking the app_id
 * from the `x-app-id` header so local curl/automation keeps working.
 */
export async function authorizeAdmin(request: NextRequest): Promise<AdminSession> {
  const session = await getAdminFromRequest(request);
  if (session) return session;
  if (process.env.NODE_ENV !== 'production') {
    const expected = process.env.MOBILEUI_ADMIN_KEY ?? 'local-development-admin';
    if (request.headers.get('x-admin-key') === expected) {
      const appId = request.headers.get('x-app-id')?.trim();
      if (!appId) {
        throw new ApiError(400, 'APP_ID_REQUIRED', '缺少 x-app-id 头：请先选择租户');
      }
      return { admin: HEADER_ADMIN, appId };
    }
  }
  throw new ApiError(401, 'ADMIN_UNAUTHORIZED', '请先登录控制台');
}

/**
 * Returns the admin identity plus the request scope. The app_id always comes
 * from the authenticated session (never the client header), so a logged-in
 * admin can only ever see the app they bound at login. The environment still
 * comes from the `x-app-environment` header so the admin can switch release
 * lanes within that app.
 */
export async function adminContext(request: NextRequest): Promise<{
  admin: AdminProfile;
  scope: AdminScope;
}> {
  const { admin, appId } = await authorizeAdmin(request);
  const environment = request.headers.get('x-app-environment')?.trim();
  if (!environment) {
    throw new ApiError(400, 'ENVIRONMENT_REQUIRED', '缺少 x-app-environment 头：请先选择环境');
  }
  return { admin, scope: { appId, environment } };
}

export async function setAdminCookie(token: string) {
  const store = await cookies();
  store.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: Math.floor(ADMIN_SESSION_TTL_MS / 1000),
  });
}

export async function clearAdminCookie() {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
}
