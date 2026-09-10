import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleError, ok } from '@/lib/http';
import { requireIdentity } from '@/lib/identity';
import { listSkinTrials, startSkinTrial } from '@/features/store/data/trial-service';

export const dynamic = 'force-dynamic';

const startTrialSchema = z.object({
  // skinId 接受皮肤 id 或 slug
  skinId: z.string().min(1).max(120),
});

// GET /api/v1/store/skin-trials —— 当前用户全部试用记录（客户端试用入口
// 的服务端真相：出现过即不再出「免费试 24 小时」）。
export async function GET(request: NextRequest) {
  try {
    const identity = await requireIdentity(request);
    const trials = await listSkinTrials(identity.userId);
    return ok({ trials });
  } catch (error) {
    return handleError(error);
  }
}

// POST /api/v1/store/skin-trials —— 开启试用：发放 skin.trial.{slug} 权益
// （expires_at = now + SKIN_TRIAL_TTL_HOURS，缺省 24h）。已拥有 → owned；
// 已试过（含过期行）→ 409 SKIN_TRIAL_ALREADY_USED。
export async function POST(request: NextRequest) {
  try {
    const identity = await requireIdentity(request);
    const input = startTrialSchema.parse(await request.json());
    const result = await startSkinTrial({
      userId: identity.userId,
      skinIdOrSlug: input.skinId,
      nowIso: new Date().toISOString(),
    });
    return ok(result, 201);
  } catch (error) {
    return handleError(error);
  }
}
