import { NextRequest } from 'next/server';
import { database, nowIso, runTransaction } from '@/server/database';
import { handleError, ok } from '@/server/http';
import { createId } from '@/server/ids';
import { feedbackSchema } from '@/server/schemas';
import {
  feedbackView,
  getSupportIdentity,
  resolveSupportRoute,
} from '@/server/support';

export async function POST(request: NextRequest) {
  try {
    const identity = await getSupportIdentity(request);
    const input = feedbackSchema.parse(await request.json());
    const route = await resolveSupportRoute(request, 'suggestion');
    const id = createId();
    const now = nowIso();
    const insertFeedback = database.prepare(`
      INSERT INTO product_feedback(
        id, app_id, user_id, installation_id, locale, market, data_region,
        queue_id, category, title, body, rating, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?, ?)
    `);
    const insertAttachment = database.prepare(`
      INSERT INTO feedback_attachments(
        id, feedback_id, file_name, mime_type, content, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    await runTransaction(async () => {
      await insertFeedback.run(
        id, route.appId, identity.userId, identity.installationId || null,
        route.locale, route.market, route.dataRegion, route.queueId,
        input.category, input.title, input.body, input.rating ?? null, now, now,
      );
      for (const screenshot of input.screenshots) {
        await insertAttachment.run(
          createId(),
          id,
          screenshot.fileName,
          screenshot.mimeType,
          screenshot.data,
          now,
        );
      }
    });
    const row = await database.prepare('SELECT * FROM product_feedback WHERE id = ?').get(id);
    return ok(feedbackView(row as Record<string, unknown>), 201);
  } catch (error) {
    return handleError(error);
  }
}
