import { NextRequest } from 'next/server';
import { requireAuth } from '@/server/auth';
import { database } from '@/server/database';
import { handleError, ok } from '@/server/http';

type SummaryRow = { sessions: number; screenViews: number; activeMinutes: number };
type ScreenRow = { screenId: string; views: number; durationMs: number };

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const summary = await database.prepare(`
      SELECT COUNT(DISTINCT session_id) AS sessions,
        SUM(CASE WHEN name = 'screen_view' THEN 1 ELSE 0 END) AS screenViews,
        CAST(COALESCE(SUM(CASE WHEN name = 'screen_leave'
          THEN COALESCE((properties::jsonb ->> 'duration_ms')::numeric, 0)
          ELSE 0 END), 0) / 60000 AS INTEGER)
          AS activeMinutes
      FROM telemetry_events WHERE app_id = ? AND user_id = ?
    `).get(user.app_id, user.id) as SummaryRow;
    const screens = await database.prepare(`
      SELECT COALESCE(screen_id, 'unknown') AS screenId,
        SUM(CASE WHEN name = 'screen_view' THEN 1 ELSE 0 END) AS views,
        COALESCE(SUM(CASE WHEN name = 'screen_leave'
          THEN COALESCE((properties::jsonb ->> 'duration_ms')::numeric, 0)
          ELSE 0 END), 0) AS durationMs
      FROM telemetry_events
      WHERE app_id = ? AND user_id = ? AND screen_id IS NOT NULL
      GROUP BY screen_id ORDER BY durationMs DESC, views DESC LIMIT 20
    `).all(user.app_id, user.id) as ScreenRow[];
    return ok({
      sessions: Number(summary.sessions ?? 0),
      screenViews: Number(summary.screenViews ?? 0),
      activeMinutes: Number(summary.activeMinutes ?? 0),
      screens: screens.map((screen) => ({
        screenId: screen.screenId,
        views: Number(screen.views),
        durationMs: Number(screen.durationMs),
      })),
    });
  } catch (error) {
    return handleError(error);
  }
}
