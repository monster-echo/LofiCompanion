import { NextRequest } from 'next/server';
import { getClientContext } from '@/server/client-context';
import { database } from '@/server/database';
import { ApiError, handleError, ok } from '@/server/http';
import { feedbackView, getSupportIdentity } from '@/server/support';

type Context = Readonly<{ params: Promise<{ id: string }> }>;

export async function GET(request: NextRequest, context: Context) {
  try {
    const identity = await getSupportIdentity(request);
    const client = getClientContext(request);
    const { id } = await context.params;
    const row = await database.prepare(`
      SELECT * FROM product_feedback WHERE id = ? AND app_id = ? AND (
        (?::text IS NOT NULL AND user_id = ?)
        OR (?::text IS NULL AND user_id IS NULL AND installation_id = ?)
      )
    `).get(
      id,
      client.appId,
      identity.userId,
      identity.userId,
      identity.userId,
      identity.installationId,
    ) as Record<string, unknown> | undefined;
    if (!row) throw new ApiError(404, 'FEEDBACK_NOT_FOUND', '反馈不存在');
    return ok(feedbackView(row));
  } catch (error) {
    return handleError(error);
  }
}
