import { database } from '@/server/database';
import { handleError, ok } from '@/server/http';

export async function GET() {
  try {
    await database.prepare('SELECT 1').get();
    return ok({ status: 'ready', database: 'connected' });
  } catch (error) {
    return handleError(error);
  }
}

