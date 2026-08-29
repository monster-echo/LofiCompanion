import { NextRequest } from 'next/server';
import { database, nowIso } from '@/server/database';
import { handleError, ok } from '@/server/http';
import { createId } from '@/server/ids';
import { supportMessageSchema } from '@/server/schemas';
import { getOwnedTicket } from '@/server/support';

type Context = Readonly<{ params: Promise<{ id: string }> }>;

export async function POST(request: NextRequest, context: Context) {
  try {
    const { id } = await context.params;
    await getOwnedTicket(request, id);
    const input = supportMessageSchema.parse(await request.json());
    const messageId = createId();
    const now = nowIso();
    await database.prepare(`
      INSERT INTO support_messages(id, ticket_id, author_type, body, created_at)
      VALUES (?, ?, 'user', ?, ?)
    `).run(messageId, id, input.message, now);
    await database.prepare(`
      UPDATE support_tickets SET status = 'waiting_for_support', updated_at = ?
      WHERE id = ?
    `).run(now, id);
    return ok({ id: messageId, authorType: 'user', body: input.message, createdAt: now }, 201);
  } catch (error) {
    return handleError(error);
  }
}
