import { NextRequest } from 'next/server';
import { requireAuth } from '@/server/auth';
import { handleError, ok } from '@/server/http';
import { migrateGuestSessions } from '@/features/focus/data/migrate';

export const dynamic = 'force-dynamic';

// POST /api/v1/sync/migrate —— 登录后游客本地历史一次性迁移。
// 服务端按 (user_id, client_request_id) 幂等去重：重复调用 migrated=0。
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const body = (await request.json()) as { sessions?: Parameters<typeof migrateGuestSessions>[1] };
    const result = await migrateGuestSessions(user.id, body.sessions ?? []);
    return ok(result);
  } catch (error) {
    return handleError(error);
  }
}
