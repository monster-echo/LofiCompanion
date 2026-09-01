import type { NextRequest } from 'next/server';
import { ApiError } from '@/lib/apiError';
import { handleError, ok } from '@/lib/http';
import { requireIdentity } from '@/lib/identity';
import { isStudyRoomId } from '@/features/studyroom/domain/rooms';
import { sendDanmaku } from '@/features/studyroom/server/sendDanmaku';

export const dynamic = 'force-dynamic';

// POST /api/studyroom/danmaku?room=<id>  body{content}
// 发送弹幕（SSE 单向架构下客户端→服务端走普通 HTTP）。鉴权必填（访客 401，
// 与旧 WS「无身份 = 只读」同语义）。管道：校验→黑名单→冷却→落库→房间广播；
// 失败以标准 error envelope 返回（code: TOO_LONG/EMPTY/INVALID/BLOCKED/COOLDOWN/
// STORAGE_UNAVAILABLE，COOLDOWN 带 retryAfterSeconds）。
export async function POST(request: NextRequest) {
  try {
    const identity = await requireIdentity(request);
    const room = request.nextUrl.searchParams.get('room');
    if (!isStudyRoomId(room)) {
      throw new ApiError(400, 'INVALID_ROOM', '未知自习室');
    }
    let contentRaw: unknown;
    try {
      contentRaw = ((await request.json()) as { content?: unknown }).content;
    } catch {
      throw new ApiError(400, 'INVALID', '请求体不是合法 JSON');
    }
    const message = await sendDanmaku({ roomId: room, identity, contentRaw });
    return ok({ message });
  } catch (error) {
    return handleError(error);
  }
}