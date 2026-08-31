import type { NextRequest } from 'next/server';
import { ApiError, handleError, ok } from '@/lib/http';
import { requireIdentity } from '@/lib/identity';
import { createSession } from '@/features/focus/data/repository';

const ACTIVITIES = new Set(['homework', 'reading', 'coding', 'vocab', 'free']);

// POST /api/v1/focus/sessions —— 创建专注会话（clientRequestId 幂等）。
export async function POST(request: NextRequest) {
  try {
    const identity = await requireIdentity(request);
    const body = (await request.json()) as {
      activity?: string; plannedSeconds?: number; clientRequestId?: string;
      installationId?: string; startedAt?: number;
    };
    if (!body.activity || !ACTIVITIES.has(body.activity)) {
      throw new ApiError(422, 'VALIDATION_ERROR', '活动类型无效');
    }
    if (!body.plannedSeconds || body.plannedSeconds < 300 || body.plannedSeconds > 10800) {
      throw new ApiError(422, 'VALIDATION_ERROR', '计划时长须为 5–180 分钟');
    }
    if (!body.clientRequestId || typeof body.clientRequestId !== 'string') {
      throw new ApiError(422, 'VALIDATION_ERROR', '缺少 clientRequestId');
    }
    const startedAt = body.startedAt ?? Date.now();
    if (startedAt > Date.now() + 5000 || Date.now() - startedAt > 24 * 60 * 60 * 1000) {
      throw new ApiError(422, 'SESSION_CLOCK_SKEW', '开始时间超出允许范围');
    }
    const session = await createSession({
      userId: identity.userId,
      installationId: body.installationId ?? null,
      activity: body.activity,
      plannedSeconds: body.plannedSeconds,
      clientRequestId: body.clientRequestId,
      startedAt,
    });
    return ok({ session }, 201);
  } catch (error) {
    return handleError(error);
  }
}
