import { NextRequest } from 'next/server';
import { requireAuth } from '@/server/auth';
import { database } from '@/server/database';
import { handleError, ok } from '@/server/http';
import { SessionView } from '@/domain/user';

type SessionRow = {
  id: string;
  device_name: string;
  created_at: string;
  last_seen_at: string;
};

export async function GET(request: NextRequest) {
  try {
    const { user, session } = await requireAuth(request);
    const rows = await database.prepare(`
      SELECT id, device_name, created_at, last_seen_at
      FROM sessions WHERE user_id = ? AND revoked_at IS NULL
      ORDER BY last_seen_at DESC
    `).all(user.id) as SessionRow[];
    const result: SessionView[] = rows.map((row) => ({
      id: row.id,
      deviceName: row.device_name,
      current: row.id === session.id,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
    }));
    return ok(result);
  } catch (error) {
    return handleError(error);
  }
}

