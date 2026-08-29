import { NextRequest } from 'next/server';
import { requireAuth } from '@/server/auth';
import { database } from '@/server/database';
import { handleError, ok } from '@/server/http';

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const cursor = request.nextUrl.searchParams.get('cursor');
    const requested = Number(request.nextUrl.searchParams.get('limit') ?? 30);
    const limit = Math.min(100, Math.max(1, Number.isFinite(requested) ? requested : 30));
    const rows = await database.prepare(`
      SELECT id, type, title, body, route, read_at AS readAt, created_at AS createdAt
      FROM notifications
      WHERE user_id = ? AND (?::text IS NULL OR created_at < ?)
      ORDER BY created_at DESC LIMIT ?
    `).all(user.id, cursor, cursor, limit + 1) as Array<Record<string, unknown>>;
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    return ok({
      items,
      nextCursor: hasMore ? items.at(-1)?.createdAt ?? null : null,
    });
  } catch (error) {
    return handleError(error);
  }
}
