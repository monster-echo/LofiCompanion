import { NextRequest } from 'next/server';
import { getUserRow, requireAuth, toPublicUser } from '@/server/auth';
import { database, nowIso } from '@/server/database';
import { ApiError, handleError, ok } from '@/server/http';
import { profileSchema } from '@/server/schemas';

export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const input = profileSchema.parse(await request.json());
    const username = input.username ?? user.username;
    const displayName = input.displayName ?? user.display_name ?? username;
    const bio = input.bio ?? user.bio;
    const avatarUrl = input.avatarUrl === undefined ? user.avatar_url : input.avatarUrl;
    // username 唯一性：已存在则拒绝
    if (username !== user.username) {
      const taken = await database.prepare(
        'SELECT id FROM users WHERE username = ? AND app_id = ? AND id != ?',
      ).get(username, user.app_id, user.id);
      if (taken) throw new ApiError(409, 'USERNAME_TAKEN', '用户名已被占用');
    }
    await database.prepare(`
      UPDATE users
      SET username = ?, display_name = ?, bio = ?, avatar_url = ?, updated_at = ?
      WHERE id = ?
    `).run(username, displayName, bio, avatarUrl, nowIso(), user.id);
    return ok(toPublicUser(await getUserRow(user.id)));
  } catch (error) {
    return handleError(error);
  }
}

export const PUT = PATCH;
