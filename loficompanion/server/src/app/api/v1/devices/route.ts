import { NextRequest } from 'next/server';
import { requireAuth } from '@/server/auth';
import { getClientContext } from '@/server/client-context';
import { database, nowIso } from '@/server/database';
import { handleError, ok } from '@/server/http';
import { createId } from '@/server/ids';
import { pushDeviceSchema } from '@/server/schemas';

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const client = getClientContext(request);
    const input = pushDeviceSchema.parse(await request.json());
    const id = createId();
    const now = nowIso();
    await database.prepare(`
      INSERT INTO push_devices(
        id, app_id, environment, user_id, installation_id, platform, provider,
        push_token, locale, timezone, app_version, enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(app_id, environment, user_id, installation_id) DO UPDATE SET
        platform = excluded.platform, provider = excluded.provider,
        push_token = excluded.push_token, locale = excluded.locale,
        timezone = excluded.timezone, app_version = excluded.app_version,
        enabled = 1, updated_at = excluded.updated_at
    `).run(
      id, user.app_id, client.environment, user.id, input.installationId,
      client.platform, input.provider, input.token, input.locale,
      input.timezone, client.appVersion, now, now,
    );
    const row = await database.prepare(`
      SELECT id, installation_id AS installationId, platform, provider,
        locale, timezone, app_version AS appVersion, enabled, updated_at AS updatedAt
      FROM push_devices
      WHERE app_id = ? AND environment = ? AND user_id = ? AND installation_id = ?
    `).get(user.app_id, client.environment, user.id, input.installationId);
    return ok(row, 201);
  } catch (error) {
    return handleError(error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const client = getClientContext(request);
    return ok(await database.prepare(`
      SELECT id, installation_id AS installationId, platform, provider,
        locale, timezone, app_version AS appVersion, enabled, updated_at AS updatedAt
      FROM push_devices WHERE app_id = ? AND environment = ? AND user_id = ?
      ORDER BY updated_at DESC
    `).all(user.app_id, client.environment, user.id));
  } catch (error) {
    return handleError(error);
  }
}
