import { database, nowIso } from '@/server/database';

// 榜单隐私设置（docs/01 §5.7）：public_display=0 关闭公开昵称（仍参与排名）；
// opted_out=1 退出榜单（从所有榜单查询消失）。行懒创建，默认公开/未退出。

interface SettingsRow {
  user_id: string;
  public_display: number;
  opted_out: number;
  updated_at: string;
}

export interface LeaderboardSettings {
  publicDisplay: boolean;
  optedOut: boolean;
  updatedAt: string;
}

function toSettings(row: SettingsRow): LeaderboardSettings {
  return {
    publicDisplay: row.public_display === 1,
    optedOut: row.opted_out === 1,
    updatedAt: row.updated_at,
  };
}

async function insertDefaults(userId: string) {
  await database.prepare(
    `INSERT INTO leaderboard_settings(user_id, public_display, opted_out, updated_at)
     VALUES (?, 1, 0, ?) ON CONFLICT (user_id) DO NOTHING`,
  ).run(userId, nowIso());
}

/** 懒创建 + 读取：无设置行则种默认值（公开、未退出）。 */
export async function getOrCreateLeaderboardSettings(userId: string): Promise<LeaderboardSettings> {
  const existing = await database.prepare(
    'SELECT * FROM leaderboard_settings WHERE user_id = ?',
  ).get(userId) as SettingsRow | undefined;
  if (existing) return toSettings(existing);
  await insertDefaults(userId);
  const created = await database.prepare(
    'SELECT * FROM leaderboard_settings WHERE user_id = ?',
  ).get(userId) as SettingsRow;
  return toSettings(created);
}

/** 部分更新：未指定字段保持现值；返回更新后的设置。 */
export async function updateLeaderboardSettings(
  userId: string,
  patch: { publicDisplay?: boolean; optedOut?: boolean },
): Promise<LeaderboardSettings> {
  const current = await getOrCreateLeaderboardSettings(userId);
  const publicDisplay = patch.publicDisplay ?? current.publicDisplay;
  const optedOut = patch.optedOut ?? current.optedOut;
  const updatedAt = nowIso();
  await database.prepare(
    `UPDATE leaderboard_settings
     SET public_display = ?, opted_out = ?, updated_at = ?
     WHERE user_id = ?`,
  ).run(publicDisplay ? 1 : 0, optedOut ? 1 : 0, updatedAt, userId);
  return { publicDisplay, optedOut, updatedAt };
}
