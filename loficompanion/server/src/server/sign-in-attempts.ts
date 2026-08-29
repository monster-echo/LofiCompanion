import { database, nowIso } from './database';
import { createId } from './ids';
import { ApiError } from './http';

const maxFailures = 5;
const lockMinutes = 15;

function normalize(identifier: string) {
  return identifier.trim().toLowerCase();
}

export async function assertSignInNotLocked(appId: string, identifier: string) {
  const row = await database.prepare(
    'SELECT locked_until FROM sign_in_attempts WHERE app_id = ? AND identifier = ?',
  ).get(appId, normalize(identifier)) as { locked_until: string | null } | undefined;
  if (!row?.locked_until) return;
  const lockedUntil = Date.parse(row.locked_until);
  if (lockedUntil <= Date.now()) return;
  const retryAfterSeconds = Math.max(1, Math.ceil((lockedUntil - Date.now()) / 1000));
  throw new ApiError(
    429,
    'SIGN_IN_LOCKED',
    '尝试次数过多，请稍后再试',
    true,
    undefined,
    retryAfterSeconds,
  );
}

export async function recordSignInFailure(appId: string, identifier: string) {
  const norm = normalize(identifier);
  const row = await database.prepare(
    'SELECT failed_count FROM sign_in_attempts WHERE app_id = ? AND identifier = ?',
  ).get(appId, norm) as { failed_count: number } | undefined;
  const nextCount = (row?.failed_count ?? 0) + 1;
  const lockedUntil = nextCount >= maxFailures
    ? new Date(Date.now() + lockMinutes * 60_000).toISOString()
    : null;
  await database.prepare(`
    INSERT INTO sign_in_attempts(
      id, app_id, identifier, failed_count, locked_until, last_attempt_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(app_id, identifier) DO UPDATE SET
      failed_count = excluded.failed_count,
      locked_until = excluded.locked_until,
      last_attempt_at = excluded.last_attempt_at
  `).run(createId(), appId, norm, nextCount, lockedUntil, nowIso());
}

export async function recordSignInSuccess(appId: string, identifier: string) {
  await database.prepare(
    'DELETE FROM sign_in_attempts WHERE app_id = ? AND identifier = ?',
  ).run(appId, normalize(identifier));
}
