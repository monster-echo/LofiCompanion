import { NextRequest } from 'next/server';
import { requireAuth } from '@/server/auth';
import { database } from '@/server/database';
import { handleError, ok } from '@/server/http';

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const notifications = await database.prepare(`
      SELECT id, type, title, body, route,
        read_at AS readAt, created_at AS createdAt
      FROM notifications WHERE user_id = ?
      ORDER BY created_at DESC LIMIT 50
    `).all(user.id);
    return ok(notifications);
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    await database.prepare(`
      UPDATE notifications SET read_at = COALESCE(read_at, ?)
      WHERE user_id = ?
    `).run(new Date().toISOString(), user.id);
    return ok({ allRead: true });
  } catch (error) {
    return handleError(error);
  }
}

export const PUT = PATCH;
