import { NextRequest } from 'next/server';
import { requireAuth } from '@/server/auth';
import { database, nowIso } from '@/server/database';
import { handleError, ok } from '@/server/http';

export async function DELETE(
  request: NextRequest,
  context: Readonly<{ params: Promise<{ id: string }> }>,
) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await context.params;
    const result = await database.prepare(`
      UPDATE sessions SET revoked_at = ?
      WHERE id = ? AND user_id = ? AND revoked_at IS NULL
    `).run(nowIso(), id, user.id);
    return ok({ revoked: result.changes === 1 });
  } catch (error) {
    return handleError(error);
  }
}
