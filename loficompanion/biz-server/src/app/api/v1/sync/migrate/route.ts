import type { NextRequest } from 'next/server';
import { handleError, ok } from '@/lib/http';
import { requireIdentity } from '@/lib/identity';
import { migrateGuestSessions } from '@/features/focus/data/migrate';

// POST /api/v1/sync/migrate —— 登录后游客本地历史一次性迁移。
// 服务端按 (user_id, client_request_id) 幂等去重：重复调用 migrated=0。
export async function POST(request: NextRequest) {
  try {
    const identity = await requireIdentity(request);
    const body = (await request.json()) as { sessions?: Parameters<typeof migrateGuestSessions>[1] };
    const result = await migrateGuestSessions(identity.userId, body.sessions ?? []);
    return ok(result);
  } catch (error) {
    return handleError(error);
  }
}
