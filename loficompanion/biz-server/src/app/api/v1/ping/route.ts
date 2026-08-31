// 垂直切片样板：JWT 验签 → Prisma 查询 → 遥测埋点 → JSON。
// 业务落地时照这个骨架写自己的端点（或用 `mobileui feature add` 生成分层骨架）。
import { NextResponse, type NextRequest } from 'next/server';

import { extractBearerToken, verifyAccessToken } from '@/auth/jwt';
import { getDb } from '@/db';
import { telemetry } from '@/telemetry/reporter';

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const identity = await verifyAccessToken(
    extractBearerToken(request.headers.get('authorization')),
  );
  if (identity === null) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: '缺少有效访问令牌' } },
      { status: 401 },
    );
  }
  const sessions = await getDb().focusSession.count({ where: { user_id: identity.userId } });
  const response = NextResponse.json({
    pong: true,
    userId: identity.userId,
    appId: identity.appId,
    sessions,
  });
  telemetry.log({
    route: '/api/v1/ping',
    status: response.status,
    durationMs: Date.now() - startedAt,
  });
  return response;
}
