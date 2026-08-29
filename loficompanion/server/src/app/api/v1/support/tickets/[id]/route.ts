import { NextRequest } from 'next/server';
import { database } from '@/server/database';
import { handleError, ok } from '@/server/http';
import { getOwnedTicket, ticketView } from '@/server/support';

type Context = Readonly<{ params: Promise<{ id: string }> }>;

export async function GET(request: NextRequest, context: Context) {
  try {
    const { id } = await context.params;
    const ticket = await getOwnedTicket(request, id) as Record<string, unknown>;
    const messages = await database.prepare(`
      SELECT id, author_type AS authorType, body, created_at AS createdAt
      FROM support_messages WHERE ticket_id = ? ORDER BY created_at ASC
    `).all(id);
    return ok({ ...ticketView(ticket), messages });
  } catch (error) {
    return handleError(error);
  }
}
