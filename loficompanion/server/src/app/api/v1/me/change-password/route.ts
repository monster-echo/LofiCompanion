import { NextRequest } from 'next/server';
import { requireAuth, revokeAllSessions } from '@/server/auth';
import { database, nowIso } from '@/server/database';
import { ApiError, handleError, ok } from '@/server/http';
import { passwordSchema } from '@/server/schemas';
import { hashPassword, verifyPassword } from '@/server/passwords';

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const input = passwordSchema.parse(await request.json());
    // 无密码账号（手机号/华为登录，password_hash 为 external$xxx）没有"当前密码"，
    // 允许直接设置新密码；有密码账号才校验当前密码。
    const hasRealPassword = !user.password_hash.startsWith('external$');
    if (hasRealPassword) {
      const valid = await verifyPassword(user.password_hash, input.currentPassword ?? '');
      if (!valid) throw new ApiError(403, 'CURRENT_PASSWORD_INVALID', '当前密码不正确');
    }
    const nextHash = await hashPassword(input.newPassword);
    await database.prepare(
      'UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?',
    ).run(nextHash, nowIso(), user.id);
    await revokeAllSessions(user.id);
    return ok({ changed: true, requiresSignIn: true });
  } catch (error) {
    return handleError(error);
  }
}
