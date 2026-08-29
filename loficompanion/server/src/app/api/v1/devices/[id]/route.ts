import { NextRequest } from 'next/server';
import { requireAuth } from '@/server/auth';
import { database, nowIso } from '@/server/database';
import { ApiError, handleError, ok } from '@/server/http';

export function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return context.params.then(async ({ id }) => {
    try {
      const { user } = await requireAuth(request);
      const result = await database.prepare(`
        UPDATE push_devices SET enabled = 0, updated_at = ?
        WHERE id = ? AND user_id = ? AND enabled = 1
      `).run(nowIso(), id, user.id);
      if (!result.changes) throw new ApiError(404, 'DEVICE_NOT_FOUND', '推送设备不存在');
      return ok({ removed: true });
    } catch (error) {
      return handleError(error);
    }
  });
}
