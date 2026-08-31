import { randomUUID } from 'node:crypto';
import { ApiError } from '../../../lib/http';
import { getDb } from '../../../db';
import { settleSession } from '../domain/settlement';
import { grantNewlyEarnedInTx, type AchievementRuleKey } from '../../achievements/data/repository';

// 游客记录一次性迁移（docs/06 P0-B）：登录后客户端推送本地历史，服务端按
// (user_id, client_request_id) 幂等去重；成就统一重评估一次。重复调用零副作用。
// Prisma 搬迁自 loficompanion/server focus/data/migrate.ts。

export interface MigratedSessionPayload {
  clientRequestId: string;
  activity: string;
  plannedSeconds: number;
  status: 'completed' | 'abandoned';
  startedAtUtc: number;
  pauses: Array<{ start: number; end: number }>;
  completedAtUtc?: number;
  abandonedAtUtc?: number;
  installationId?: string;
}

export interface MigrateResult {
  migrated: number;
  skipped: number;
  grants: AchievementRuleKey[];
}

const MAX_BATCH = 1000;

export async function migrateGuestSessions(
  userId: string,
  sessions: MigratedSessionPayload[],
): Promise<MigrateResult> {
  if (!Array.isArray(sessions)) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'sessions 必须为数组');
  }
  if (sessions.length > MAX_BATCH) {
    throw new ApiError(422, 'VALIDATION_ERROR', `单批最多 ${MAX_BATCH} 条`);
  }
  let migrated = 0;
  let skipped = 0;
  const now = new Date().toISOString();
  for (const session of sessions) {
    if (!session.clientRequestId || typeof session.clientRequestId !== 'string') {
      skipped += 1;
      continue;
    }
    const endedAt = session.completedAtUtc ?? session.abandonedAtUtc;
    const status = session.status === 'abandoned' ? 'abandoned' : 'completed';
    if (!endedAt || !Number.isFinite(session.startedAtUtc) || session.plannedSeconds < 300) {
      skipped += 1;
      continue;
    }
    // 与在线结算同口径重算有效时长（不信任客户端累计）。
    const { effectiveSeconds } = settleSession({
      plannedSeconds: session.plannedSeconds,
      startedAt: session.startedAtUtc,
      pauses: Array.isArray(session.pauses) ? session.pauses : [],
      completedAt: endedAt,
    });
    // UNIQUE(user_id, client_request_id) 幂等：重复推送 createMany skipDuplicates 落空
    const result = await getDb().focusSession.createMany({
      data: [{
        id: randomUUID(),
        user_id: userId,
        installation_id: session.installationId ?? null,
        activity: session.activity,
        planned_seconds: session.plannedSeconds,
        status,
        started_at: new Date(session.startedAtUtc).toISOString(),
        ended_at: new Date(endedAt).toISOString(),
        effective_seconds: effectiveSeconds,
        pauses: JSON.stringify(session.pauses ?? []),
        client_request_id: session.clientRequestId,
        created_at: now,
        updated_at: now,
      }],
      skipDuplicates: true,
    });
    if (result.count > 0) migrated += 1;
    else skipped += 1;
  }
  // 迁移末尾统一重评估成就（UNIQUE 兜底重复发放；批次级无单一来源会话）。
  const grants = await getDb().$transaction(async (tx) => {
    const earned = await grantNewlyEarnedInTx(tx, userId, null);
    return earned.map((grant) => grant.ruleKey);
  });
  return { migrated, skipped, grants };
}
