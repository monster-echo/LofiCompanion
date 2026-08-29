import { NextRequest } from 'next/server';
import { requireAuth } from '@/server/auth';
import { database } from '@/server/database';
import { handleError, ok } from '@/server/http';

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const row = await database.prepare(`
      SELECT COUNT(*) AS count FROM notifications
      WHERE user_id = ? AND read_at IS NULL
    `).get(user.id) as { count: number };
    return ok({ count: Number(row.count) });
  } catch (error) {
    return handleError(error);
  }
}
