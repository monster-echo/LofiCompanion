import { ApiError } from '@/lib/http';
import { getDb } from '@/db';

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

/** 懒创建 + 读取：无设置行则种默认值（公开、未退出）。 */
export async function getOrCreateLeaderboardSettings(userId: string): Promise<LeaderboardSettings> {
  const db = getDb();
  const existing = await db.leaderboardSettings.findUnique({ where: { user_id: userId } });
  if (existing) return toSettings(existing as SettingsRow);
  // ON CONFLICT (user_id) DO NOTHING 语义：并发懒创建撞 UNIQUE 后回读既有行。
  await db.leaderboardSettings.createMany({
    data: [{ user_id: userId, public_display: 1, opted_out: 0, updated_at: nowIso() }],
    skipDuplicates: true,
  });
  const created = await db.leaderboardSettings.findUnique({ where: { user_id: userId } });
  if (!created) throw new ApiError(500, 'SETTINGS_CREATE_FAILED', '榜单设置创建失败', true);
  return toSettings(created as SettingsRow);
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
  await getDb().leaderboardSettings.update({
    where: { user_id: userId },
    data: {
      public_display: publicDisplay ? 1 : 0,
      opted_out: optedOut ? 1 : 0,
      updated_at: updatedAt,
    },
  });
  return { publicDisplay, optedOut, updatedAt };
}

function nowIso(): string {
  return new Date().toISOString();
}
