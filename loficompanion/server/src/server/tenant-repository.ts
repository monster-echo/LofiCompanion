import type { SQLInputValue } from './postgres-database';
import { database } from './database';
import { sinceIso } from './time';
import { countOnlineSessions } from './session-repository';

const DAY_MINUTES = 24 * 60;

export type AppSummary = Readonly<{
  appId: string;
  environments: readonly string[];
  users: number;
  events24h: number;
  online: number;
  lastSeenAt: string | null;
}>;

export async function listApps(): Promise<AppSummary[]> {
  return Promise.all((await distinctAppIds()).map((appId) => summarize({ appId })));
}

export async function listAppIds(): Promise<string[]> {
  return await distinctAppIds();
}

export async function appExists(appId: string): Promise<boolean> {
  return Boolean(
    await database
      .prepare(`
        SELECT 1 FROM (
          SELECT app_id FROM runtime_configs WHERE app_id = ?
          UNION SELECT app_id FROM users WHERE app_id = ?
          UNION SELECT app_id FROM telemetry_events WHERE app_id = ?
        ) LIMIT 1
      `)
      .get(appId, appId, appId),
  );
}

async function distinctAppIds(): Promise<string[]> {
  const rows = await database.prepare(`
    SELECT DISTINCT app_id AS appId FROM (
      SELECT app_id FROM runtime_configs
      UNION SELECT app_id FROM users
      UNION SELECT app_id FROM telemetry_events
    ) ORDER BY appId
  `).all() as { appId: string }[];
  return rows.map((row) => row.appId);
}

async function summarize(row: { appId: string }): Promise<AppSummary> {
  const environments = await database.prepare(
    'SELECT DISTINCT environment FROM runtime_configs WHERE app_id = ? ORDER BY environment',
  ).all(row.appId) as { environment: string }[];
  const since = sinceIso(DAY_MINUTES);
  return {
    appId: row.appId,
    environments: environments.map((item) => item.environment),
    users: await count(
      'SELECT COUNT(*) AS c FROM users WHERE app_id = ?',
      row.appId,
    ),
    events24h: await count(
      'SELECT COUNT(*) AS c FROM telemetry_events WHERE app_id = ? AND received_at >= ?',
      row.appId,
      since,
    ),
    online: await countOnlineSessions(row.appId),
    lastSeenAt: await latest(
      'SELECT MAX(last_seen_at) AS at FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.app_id = ?',
      row.appId,
    ),
  };
}

async function count(sql: string, ...params: SQLInputValue[]) {
  return (await database.prepare(sql).get(...params) as { c: number }).c;
}

async function latest(sql: string, ...params: SQLInputValue[]) {
  return (await database.prepare(sql).get(...params) as { at: string | null }).at;
}
