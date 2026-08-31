import { randomUUID } from 'node:crypto';
import { ApiError } from '../../../lib/http';
import { getDb } from '../../../db';
import { grantNewlyEarnedInTx } from '../../achievements/data/repository';
import type { AchievementRuleKey } from '../../achievements/domain/rules';
import { settleSession, validateSettleInput, type SettleInput } from '../domain/settlement';

// 专注会话数据访问与幂等结算（Prisma 搬迁自 loficompanion/server
// focus-repository）。幂等三件套：创建按 UNIQUE(user_id, client_request_id)；
// 完成按 idempotency_keys；活跃会话唯一由应用层保证（docs/04 §2）。

export interface FocusSessionRow {
  id: string;
  user_id: string;
  installation_id: string | null;
  activity: string;
  planned_seconds: number;
  status: 'active' | 'paused' | 'completed' | 'abandoned';
  started_at: string;
  ended_at: string | null;
  effective_seconds: number;
  pauses: string;
  client_request_id: string;
  rule_version: number;
  created_at: string;
  updated_at: string;
}

const ACTIVE_STATUSES = ['active', 'paused'];
function nowIso(): string {
  return new Date().toISOString();
}

export async function createSession(input: {
  userId: string;
  installationId?: string | null;
  activity: string;
  plannedSeconds: number;
  clientRequestId: string;
  startedAt: number;
}): Promise<FocusSessionRow> {
  const db = getDb();
  const existing = await db.focusSession.findUnique({
    where: { user_id_client_request_id: { user_id: input.userId, client_request_id: input.clientRequestId } },
  });
  if (existing) return existing as FocusSessionRow; // 幂等重放：返回既有会话（200，非错误）

  const active = await db.focusSession.findFirst({
    where: { user_id: input.userId, status: { in: ACTIVE_STATUSES } },
    select: { id: true },
  });
  if (active) {
    throw new ApiError(409, 'ACTIVE_SESSION_EXISTS', '已有进行中的专注会话');
  }
  const id = randomUUID();
  const startedAtIso = new Date(input.startedAt).toISOString();
  const now = nowIso();
  const row = await db.focusSession.create({
    data: {
      id,
      user_id: input.userId,
      installation_id: input.installationId ?? null,
      activity: input.activity,
      planned_seconds: input.plannedSeconds,
      status: 'active',
      started_at: startedAtIso,
      pauses: '[]',
      client_request_id: input.clientRequestId,
      created_at: now,
      updated_at: now,
    },
  });
  return row as FocusSessionRow;
}

export async function getSession(id: string, userId: string): Promise<FocusSessionRow> {
  const row = await getDb().focusSession.findFirst({ where: { id, user_id: userId } });
  if (!row) throw new ApiError(404, 'SESSION_NOT_FOUND', '专注会话不存在');
  return row as FocusSessionRow;
}

export async function getActiveSession(userId: string): Promise<FocusSessionRow | null> {
  const row = await getDb().focusSession.findFirst({
    where: { user_id: userId, status: { in: ACTIVE_STATUSES } },
    orderBy: { started_at: 'desc' },
  });
  return (row as FocusSessionRow) ?? null;
}

/** 幂等包装：命中 idempotency_keys 直接返回首次响应；否则执行并存储。 */
export async function withIdempotency<T>(
  key: string,
  userId: string,
  endpoint: string,
  run: () => Promise<{ body: T; status: number }>,
): Promise<{ body: T; status: number; replayed: boolean }> {
  const db = getDb();
  const existing = await db.idempotencyKey.findUnique({
    where: { key_user_id_endpoint: { key, user_id: userId, endpoint } },
  });
  if (existing) {
    return { body: JSON.parse(existing.response_body) as T, status: existing.status_code, replayed: true };
  }
  const result = await run();
  await db.idempotencyKey.create({
    data: {
      key,
      user_id: userId,
      endpoint,
      response_body: JSON.stringify(result.body),
      status_code: result.status,
      created_at: nowIso(),
    },
  }).catch(() => undefined); // 并发重放中唯一约束兜底：首次响应已入库即可
  return { ...result, replayed: false };
}

export interface CompletePayload {
  pauses: Array<{ start: number; end: number }>;
  completedAt: number;
  /** 结束原因：completed / abandoned（提前结束） */
  outcome: 'completed' | 'abandoned';
}

export async function settleAndFinishSession(
  id: string,
  userId: string,
  payload: CompletePayload,
  idempotencyKey: string | null,
): Promise<{ session: FocusSessionRow; replayed: boolean; grants: AchievementRuleKey[] }> {
  const endpoint = `focus.complete:${id}`;
  const key = idempotencyKey ?? `complete:${id}`;
  const result = await withIdempotency<{ session: FocusSessionRow; grants: AchievementRuleKey[] }>(
    key, userId, endpoint,
    async () => {
      const row = await getSession(id, userId);
      if (row.status === 'completed' || row.status === 'abandoned') {
        return { body: { session: row, grants: [] }, status: 200 }; // 终态重放幂等返回
      }
      const settleInput: SettleInput = {
        plannedSeconds: row.planned_seconds,
        startedAt: Date.parse(row.started_at),
        pauses: payload.pauses,
        completedAt: payload.completedAt,
      };
      const error = validateSettleInput(settleInput, Date.now());
      if (error) {
        throw new ApiError(422, error, '会话区间无效');
      }
      const { effectiveSeconds } = settleSession(settleInput);
      const endedAtIso = new Date(payload.completedAt).toISOString();
      // 结算与成就发放同一事务（docs/03 §9）：重放被 idempotency_keys 挡住，
      // 成就被 achievement_grants UNIQUE 兜底——重放十次只结算/发放一次。
      const grants = await getDb().$transaction(async (tx) => {
        await tx.focusSession.update({
          where: { id },
          data: {
            status: payload.outcome,
            ended_at: endedAtIso,
            effective_seconds: effectiveSeconds,
            pauses: JSON.stringify(payload.pauses),
            updated_at: nowIso(),
          },
        });
        const earned = await grantNewlyEarnedInTx(tx, userId, id);
        return earned.map((grant) => grant.ruleKey);
      });
      return { body: { session: await getSession(id, userId), grants }, status: 200 };
    },
  );
  return { session: result.body.session, replayed: result.replayed, grants: result.body.grants };
}

export async function listHistory(userId: string, limit = 100): Promise<FocusSessionRow[]> {
  return await getDb().focusSession.findMany({
    where: { user_id: userId, status: { in: ['completed', 'abandoned'] } },
    orderBy: { started_at: 'desc' },
    take: limit,
  }) as FocusSessionRow[];
}

export interface WeeklySummary {
  todayMinutes: number;
  todaySessions: number;
  weekMinutes: number;
  weekTargetMinutes: number;
  byActivity: Array<{ activity: string; minutes: number }>;
}

// 与客户端 summarize 同口径：周界周一 00:00（Asia/Shanghai，UTC+8）。
const TZ_OFFSET_MS = 8 * 60 * 60 * 1000;
const WEEK_TARGET_MINUTES = 300;

function dayIndex(utcMs: number): number {
  return Math.floor((utcMs + TZ_OFFSET_MS) / (24 * 60 * 60 * 1000));
}

function mondayIndex(nowMs: number): number {
  const days = dayIndex(nowMs);
  return days - ((days + 3) % 7); // epoch day 0 = 周四；(d+3)%7: 0=周一
}

export async function weeklySummary(userId: string, nowMs: number): Promise<WeeklySummary> {
  const rows = await getDb().focusSession.findMany({
    where: { user_id: userId, status: 'completed' },
    select: { activity: true, effective_seconds: true, ended_at: true },
    orderBy: { ended_at: 'desc' },
    take: 1000,
  });
  const today = dayIndex(nowMs);
  const weekStart = mondayIndex(nowMs);
  let todayMinutes = 0;
  let todaySessions = 0;
  let weekMinutes = 0;
  const byActivity = new Map<string, number>();
  for (const row of rows) {
    const minutes = Math.floor(row.effective_seconds / 60);
    const ended = row.ended_at ? Date.parse(row.ended_at) : 0;
    if (dayIndex(ended) === today) {
      todayMinutes += minutes;
      todaySessions += 1;
    }
    if (dayIndex(ended) >= weekStart) {
      weekMinutes += minutes;
      byActivity.set(row.activity, (byActivity.get(row.activity) ?? 0) + minutes);
    }
  }
  return {
    todayMinutes,
    todaySessions,
    weekMinutes,
    weekTargetMinutes: WEEK_TARGET_MINUTES,
    byActivity: [...byActivity.entries()]
      .map(([activity, minutes]) => ({ activity, minutes }))
      .sort((left, right) => right.minutes - left.minutes),
  };
}
