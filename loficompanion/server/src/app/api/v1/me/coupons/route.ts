import { NextRequest } from 'next/server';
import { requireAuth } from '@/server/auth';
import { database } from '@/server/database';
import { handleError, ok } from '@/server/http';

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    return ok(await database.prepare(`
      SELECT id, code, title, discount_label AS discountLabel,
        expires_at AS expiresAt, used_at AS usedAt, created_at AS createdAt
      FROM coupons WHERE user_id = ? ORDER BY used_at IS NOT NULL, created_at DESC
    `).all(user.id));
  } catch (error) {
    return handleError(error);
  }
}
