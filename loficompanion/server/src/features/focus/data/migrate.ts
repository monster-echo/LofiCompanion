import { randomUUID } from 'node:crypto';
import { ApiError } from '@/server/http';
import { database, nowIso } from '@/server/database';
import { settleSession } from '../domain/settlement';
import { grantNewlyEarnedForSession, type AchievementRuleKey } from '@/features/achievements/service';

// 游客记录一次性迁移（docs/06 P0-B）：登录后客户端推送本地历史，服务端按
// (user_id, client_request_id) 幂等去重；成就统一重评估一次。重复调用零副作用。

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
  const now = nowIso();
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
    const result = await database.prepare(
      `INSERT INTO focus_sessions(id, user_id, installation_id, activity, planned_seconds,
         status, started_at, ended_at, effective_seconds, pauses, client_request_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, client_request_id) DO NOTHING`,
    ).run(
      randomUUID(), userId, session.installationId ?? null, session.activity,
      session.plannedSeconds, status, new Date(session.startedAtUtc).toISOString(),
      new Date(endedAt).toISOString(), effectiveSeconds, JSON.stringify(session.pauses ?? []),
      session.clientRequestId, now, now,
    );
    // postgres-database run() 返回 { changes: rowCount }（见 postgres-database.ts）。
    const inserted = (result as { changes?: number }).changes ?? 0;
    if (inserted > 0) migrated += 1;
    else skipped += 1;
  }
  // 迁移末尾统一重评估成就（UNIQUE 兜底重复发放；批次级无单一来源会话）。
  const grants = (await grantNewlyEarnedForSession(userId, null)).map((grant) => grant.ruleKey);
  return { migrated, skipped, grants };
}
