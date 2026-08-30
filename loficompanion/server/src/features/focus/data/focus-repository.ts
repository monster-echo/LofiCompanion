import { randomUUID } from 'node:crypto';
import { ApiError } from '@/server/http';
import { database, nowIso, runTransaction } from '@/server/database';
import type { SettleInput } from '../domain/settlement';
import { settleSession, validateSettleInput } from '../domain/settlement';
import { grantNewlyEarnedForSession, type AchievementRuleKey } from '@/features/achievements/service';

// 专注会话数据访问与幂等结算（docs/04 §3 路由子集的服务端实现）。
// 幂等三件套：创建按 UNIQUE(user_id, client_request_id)；完成按 idempotency_keys；
// 活跃会话唯一由应用层 + 部分唯一索引共同保证（docs/04 §2）。

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

const ACTIVE_STATUSES = "('active', 'paused')";

export async function createSession(input: {
  userId: string;
  installationId?: string | null;
  activity: string;
  plannedSeconds: number;
  clientRequestId: string;
  startedAt: number;
}): Promise<FocusSessionRow> {
  const existing = await database.prepare(
    'SELECT * FROM focus_sessions WHERE user_id = ? AND client_request_id = ?',
  ).get(input.userId, input.clientRequestId) as FocusSessionRow | undefined;
  if (existing) return existing; // 幂等重放：返回既有会话（200，非错误）

  const active = await database.prepare(
    `SELECT id FROM focus_sessions WHERE user_id = ? AND status IN ${ACTIVE_STATUSES} LIMIT 1`,
  ).get(input.userId);
  if (active) {
    throw new ApiError(409, 'ACTIVE_SESSION_EXISTS', '已有进行中的专注会话');
  }
  const id = randomUUID();
  const startedAtIso = new Date(input.startedAt).toISOString();
  const now = nowIso();
  await database.prepare(
    `INSERT INTO focus_sessions(id, user_id, installation_id, activity, planned_seconds,
       status, started_at, pauses, client_request_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'active', ?, '[]', ?, ?, ?)`,
  ).run(id, input.userId, input.installationId ?? null, input.activity,
    input.plannedSeconds, startedAtIso, input.clientRequestId, now, now);
  return await getSession(id, input.userId);
}

export async function getSession(id: string, userId: string): Promise<FocusSessionRow> {
  const row = await database.prepare(
    'SELECT * FROM focus_sessions WHERE id = ? AND user_id = ?',
  ).get(id, userId) as FocusSessionRow | undefined;
  if (!row) throw new ApiError(404, 'SESSION_NOT_FOUND', '专注会话不存在');
  return row;
}

export async function getActiveSession(userId: string): Promise<FocusSessionRow | null> {
  const row = await database.prepare(
    `SELECT * FROM focus_sessions WHERE user_id = ? AND status IN ${ACTIVE_STATUSES}
     ORDER BY started_at DESC LIMIT 1`,
  ).get(userId) as FocusSessionRow | undefined;
  return row ?? null;
}

/** 幂等包装：命中 idempotency_keys 直接返回首次响应；否则执行并存储。 */
export async function withIdempotency<T>(
  key: string,
  userId: string,
  endpoint: string,
  run: () => Promise<{ body: T; status: number }>,
): Promise<{ body: T; status: number; replayed: boolean }> {
  const existing = await database.prepare(
    'SELECT response_body, status_code FROM idempotency_keys WHERE key = ? AND user_id = ? AND endpoint = ?',
  ).get(key, userId, endpoint) as { response_body: string; status_code: number } | undefined;
  if (existing) {
    return { body: JSON.parse(existing.response_body) as T, status: existing.status_code, replayed: true };
  }
  const result = await run();
  await database.prepare(
    `INSERT INTO idempotency_keys(key, user_id, endpoint, response_body, status_code, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(key, userId, endpoint, JSON.stringify(result.body), result.status, nowIso());
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
      const error = validateSettleInput(
        { plannedSeconds: row.planned_seconds, startedAt: Date.parse(row.started_at),
          pauses: payload.pauses, completedAt: payload.completedAt },
        Date.now(),
      );
      if (error) {
        throw new ApiError(422, error, '会话区间无效');
      }
      const { effectiveSeconds } = settleSession(
        { plannedSeconds: row.planned_seconds, startedAt: Date.parse(row.started_at),
          pauses: payload.pauses, completedAt: payload.completedAt },
      );
      const endedAtIso = new Date(payload.completedAt).toISOString();
      // 结算与成就发放同一事务（docs/03 §9）：重放被 idempotency_keys 挡住，
      // 成就被 achievement_grants UNIQUE 兜底——重放十次只结算/发放一次。
      const grants = await runTransaction(async () => {
        await database.prepare(
          `UPDATE focus_sessions SET status = ?, ended_at = ?, effective_seconds = ?, pauses = ?, updated_at = ?
           WHERE id = ? AND user_id = ?`,
        ).run(payload.outcome, endedAtIso, effectiveSeconds,
          JSON.stringify(payload.pauses), nowIso(), id, userId);
        const earned = await grantNewlyEarnedForSession(userId, id);
        return earned.map((grant) => grant.ruleKey);
      });
      return { body: { session: await getSession(id, userId), grants }, status: 200 };
    },
  );
  return { session: result.body.session, replayed: result.replayed, grants: result.body.grants };
}

export async function listHistory(userId: string, limit = 100): Promise<FocusSessionRow[]> {
  return await database.prepare(
    `SELECT * FROM focus_sessions WHERE user_id = ? AND status IN ('completed', 'abandoned')
     ORDER BY started_at DESC LIMIT ?`,
  ).all(userId, limit) as FocusSessionRow[];
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
  const rows = await database.prepare(
    `SELECT activity, effective_seconds, ended_at FROM focus_sessions
     WHERE user_id = ? AND status = 'completed' ORDER BY ended_at DESC LIMIT 1000`,
  ).all(userId) as Array<{ activity: string; effective_seconds: number; ended_at: string | null }>;
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
