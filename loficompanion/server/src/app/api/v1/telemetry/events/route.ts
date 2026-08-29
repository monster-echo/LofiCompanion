import { NextRequest } from 'next/server';
import { requireAuth } from '@/server/auth';
import { getClientContext } from '@/server/client-context';
import { database, nowIso } from '@/server/database';
import { handleError, ok } from '@/server/http';
import { telemetryBatchSchema } from '@/server/schemas';

const forbiddenKey = /password|token|secret|authorization|email|phone|content/i;

export async function POST(request: NextRequest) {
  try {
    const client = getClientContext(request);
    const batch = telemetryBatchSchema.parse(await request.json());
    const userId = await optionalUserId(request);
    const insert = database.prepare(`
      INSERT INTO telemetry_events(
        event_id, app_id, user_id, anonymous_id, session_id, name, screen_id,
        occurred_at, platform, app_version, config_version, properties, received_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT DO NOTHING
    `);
    let accepted = 0;
    for (const event of batch.events) {
      const properties = sanitize(event.properties);
      const result = await insert.run(
        event.eventId,
        client.appId,
        userId,
        batch.anonymousId,
        batch.sessionId,
        event.name,
        event.screenId ?? null,
        event.occurredAt,
        client.platform,
        client.appVersion,
        event.configVersion,
        JSON.stringify(properties),
        nowIso(),
      );
      accepted += Number(result.changes);
    }
    return ok({ accepted, duplicates: batch.events.length - accepted }, 202);
  } catch (error) {
    return handleError(error);
  }
}

async function optionalUserId(request: NextRequest) {
  try {
    return (await requireAuth(request)).user.id;
  } catch {
    return null;
  }
}

function sanitize(properties: Readonly<Record<string, string | number | boolean>>) {
  return Object.fromEntries(
    Object.entries(properties).filter(([key]) => !forbiddenKey.test(key)),
  );
}
