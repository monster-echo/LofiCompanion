import { NextRequest } from 'next/server';
import { requireAuth } from '@/server/auth';
import { database, nowIso } from '@/server/database';
import { ApiError, handleError, ok } from '@/server/http';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await context.params;
    const result = await database.prepare(`
      UPDATE notifications SET read_at = COALESCE(read_at, ?)
      WHERE id = ? AND user_id = ?
    `).run(nowIso(), id, user.id);
    if (!result.changes) throw new ApiError(404, 'NOTIFICATION_NOT_FOUND', '通知不存在');
    return ok({ read: true });
  } catch (error) {
    return handleError(error);
  }
}

export const PUT = PATCH;

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await context.params;
    const result = await database.prepare(
      'DELETE FROM notifications WHERE id = ? AND user_id = ?',
    ).run(id, user.id);
    if (!result.changes) throw new ApiError(404, 'NOTIFICATION_NOT_FOUND', '通知不存在');
    return ok({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}
