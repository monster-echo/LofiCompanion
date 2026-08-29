import { database, nowIso } from './database';
import { getUserRow, toPublicUser } from './auth';

/**
 * GDPR-style "download my data": gathers everything the server stores about a
 * user across tables. Sensitive columns (password hashes, session token hashes)
 * are intentionally excluded. Results are returned as plain JSON objects.
 */
export async function exportAccountData(userId: string) {
  const user = await getUserRow(userId);
  return {
    exportedAt: nowIso(),
    profile: toPublicUser(user),
    sessions: await rows(
      `SELECT id, device_name AS deviceName, created_at AS createdAt,
        last_seen_at AS lastSeenAt, expires_at AS expiresAt, revoked_at AS revokedAt
      FROM sessions WHERE user_id = ? ORDER BY created_at DESC`,
      userId,
    ),
    notifications: await rows(
      `SELECT id, type, title, body, route, read_at AS readAt, created_at AS createdAt
      FROM notifications WHERE user_id = ? ORDER BY created_at DESC`,
      userId,
    ),
    orders: await rows(
      `SELECT id, plan_id AS planId, status, amount_minor AS amountMinor, currency,
        provider, created_at AS createdAt, completed_at AS completedAt
      FROM orders WHERE user_id = ? ORDER BY created_at DESC`,
      userId,
    ),
    coupons: await rows(
      `SELECT id, code, title, discount_label AS discountLabel, expires_at AS expiresAt,
        used_at AS usedAt, created_at AS createdAt
      FROM coupons WHERE user_id = ? ORDER BY created_at DESC`,
      userId,
    ),
    referral: await one(
      `SELECT code, created_at AS createdAt FROM referral_profiles WHERE user_id = ?`,
      userId,
    ),
    support: {
      tickets: await rows(
        `SELECT id, category, severity, subject, status,
          created_at AS createdAt, updated_at AS updatedAt
        FROM support_tickets WHERE user_id = ? ORDER BY created_at DESC`,
        userId,
      ),
      messages: await rows(
        `SELECT m.id, m.ticket_id AS ticketId, m.author_type AS authorType, m.body,
          m.created_at AS createdAt
        FROM support_messages m
        JOIN support_tickets t ON t.id = m.ticket_id
        WHERE t.user_id = ? ORDER BY m.created_at DESC`,
        userId,
      ),
    },
    telemetry: await rows(
      `SELECT event_id AS eventId, name, screen_id AS screenId, occurred_at AS occurredAt,
        platform, app_version AS appVersion
      FROM telemetry_events WHERE user_id = ? ORDER BY occurred_at DESC LIMIT 500`,
      userId,
    ),
  };
}

async function rows(sql: string, ...params: ReadonlyArray<unknown>) {
  return await database.prepare(sql).all(...params as never[]);
}

async function one(sql: string, ...params: ReadonlyArray<unknown>) {
  return await database.prepare(sql).get(...params as never[]) ?? null;
}
