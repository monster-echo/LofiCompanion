import { NextRequest } from 'next/server';
import { requireAuth } from '@/server/auth';
import { database, runTransaction } from '@/server/database';
import { ApiError, handleError, ok } from '@/server/http';
import { deletionSchema } from '@/server/schemas';
import { verifyPassword } from '@/server/passwords';

export async function DELETE(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const input = deletionSchema.parse(await request.json());
    const valid = await verifyPassword(user.password_hash, input.password);
    if (!valid) throw new ApiError(403, 'PASSWORD_INVALID', '密码不正确');
    await runTransaction(async () => {
      const tickets = await database.prepare(
        'SELECT id FROM support_tickets WHERE user_id = ?',
      ).all(user.id) as { id: string }[];
      const deleteMessages = database.prepare(
        'DELETE FROM support_messages WHERE ticket_id = ?',
      );
      for (const ticket of tickets) await deleteMessages.run(ticket.id);
      await database.prepare('DELETE FROM support_tickets WHERE user_id = ?').run(user.id);
      await database.prepare('DELETE FROM product_feedback WHERE user_id = ?').run(user.id);
      await database.prepare(
        'UPDATE telemetry_events SET user_id = NULL WHERE user_id = ?',
      ).run(user.id);
      await database.prepare(
        'DELETE FROM password_reset_challenges WHERE user_id = ?',
      ).run(user.id);
      await database.prepare(
        'DELETE FROM password_reset_tokens WHERE user_id = ?',
      ).run(user.id);
      await database.prepare(
        'DELETE FROM outbound_messages WHERE app_id = ? AND recipient = ?',
      ).run(user.app_id, user.email);
      await database.prepare('DELETE FROM users WHERE id = ?').run(user.id);
    });
    return ok({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}
