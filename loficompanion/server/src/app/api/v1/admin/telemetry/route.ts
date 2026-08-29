import { NextRequest } from 'next/server';
import { adminContext } from '@/server/admin-auth';
import { database } from '@/server/database';
import { handleError, ok } from '@/server/http';

// GET /api/v1/admin/telemetry?from=&to=&event=&limit=&offset=
// （issue #16）遥测分析：概览 + 事件/页面/错误聚合 + 分页原始事件。
//  - 概览：总事件、活跃会话（session 去重）、崩溃率（app_error/会话）、
//    native_crash 数
//  - topScreens：screen_view 按 screen_id 计数
//  - topClicks：click 按 properties.button（客户端约定字段）计数
//  - topErrors：app_error/native_crash 按 error_name/message 或 fault_name 聚合
//  - daily：按天事件量趋势
//  - events：分页原始事件（新→旧）
export async function GET(request: NextRequest) {
  try {
    const { scope } = await adminContext(request);
    const params = request.nextUrl.searchParams;
    const from = params.get('from')?.trim() || '';
    const to = params.get('to')?.trim() || '';
    const event = params.get('event')?.trim() || '';
    const limit = Math.min(Number(params.get('limit') ?? 50) || 50, 200);
    const offset = Math.max(Number(params.get('offset') ?? 0) || 0, 0);

    // admin 会话绑定 app_id 作用域；时间范围（ISO 前缀即可，含日期粒度）。
    const range: string[] = [];
    const args: string[] = [scope.appId];
    if (from) {
      range.push('occurred_at >= ?');
      args.push(from);
    }
    if (to) {
      range.push('occurred_at <= ?');
      args.push(`${to.endsWith('Z') ? to : `${to}~`}`);
    }
    const where = `app_id = ?${range.length ? ` AND ${range.join(' AND ')}` : ''}`;
    // "~" 排在 "Z" 前：把无时区结尾的 to 变成上界（含当天全部 ISO 字符串）。

    const [overview] = await database.prepare(`
      SELECT
        COUNT(*) AS events,
        COUNT(DISTINCT session_id) AS sessions,
        SUM(CASE WHEN name IN ('app_error', 'native_crash') THEN 1 ELSE 0 END) AS errors
      FROM telemetry_events WHERE ${where}
    `).all(...args) as { events: number; sessions: number; errors: number }[];

    const topScreens = await database.prepare(`
      SELECT screen_id AS screen, COUNT(*) AS count
      FROM telemetry_events
      WHERE ${where} AND name = 'screen_view' AND screen_id IS NOT NULL AND screen_id != ''
      GROUP BY screen_id ORDER BY count DESC LIMIT 20
    `).all(...args);

    const topClicks = await database.prepare(`
      SELECT properties AS props, COUNT(*) AS count
      FROM telemetry_events
      WHERE ${where} AND name = 'click'
      GROUP BY properties ORDER BY count DESC LIMIT 20
    `).all(...args) as { props: string; count: number }[];

    const topErrors = await database.prepare(`
      SELECT name, screen_id AS screen, properties AS props, COUNT(*) AS count
      FROM telemetry_events
      WHERE ${where} AND name IN ('app_error', 'native_crash')
      GROUP BY name, screen_id, substr(properties, 1, 160)
      ORDER BY count DESC LIMIT 20
    `).all(...args) as { name: string; screen: string | null; props: string; count: number }[];

    const daily = await database.prepare(`
      SELECT substr(occurred_at, 1, 10) AS day, COUNT(*) AS count,
        COUNT(DISTINCT session_id) AS sessions
      FROM telemetry_events WHERE ${where}
      GROUP BY day ORDER BY day DESC LIMIT 30
    `).all(...args);

    const eventFilter = event ? 'AND name = ?' : '';
    const eventArgs = event ? [...args, event] : args;
    const events = await database.prepare(`
      SELECT event_id, name, screen_id, occurred_at, platform, app_version,
        session_id, properties
      FROM telemetry_events
      WHERE ${where} ${eventFilter}
      ORDER BY occurred_at DESC LIMIT ? OFFSET ?
    `).all(...eventArgs, String(limit), String(offset));

    const crashRate = overview.sessions > 0
      ? Number((overview.errors / overview.sessions).toFixed(4))
      : 0;

    return ok({
      scope: { appId: scope.appId, environment: scope.environment },
      range: { from, to },
      overview: {
        events: overview.events,
        sessions: overview.sessions,
        errors: overview.errors,
        crashRate,
      },
      topScreens,
      topClicks: topClicks.map((row) => ({
        button: extractProperty(row.props, 'button'),
        count: row.count,
      })),
      topErrors: topErrors.map((row) => ({
        name: row.name,
        screen: row.screen,
        errorName: extractProperty(row.props, 'error_name'),
        errorMessage: extractProperty(row.props, 'error_message'),
        faultName: extractProperty(row.props, 'fault_name'),
        count: row.count,
      })),
      daily,
      events,
      paging: { limit, offset },
    });
  } catch (error) {
    return handleError(error);
  }
}

// properties 是 JSON 文本；解析失败返回 null，避免聚合接口 500。
function extractProperty(json: string, key: string): string | null {
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const value = parsed[key];
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}
