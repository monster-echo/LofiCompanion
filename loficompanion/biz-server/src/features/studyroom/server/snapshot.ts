// join 快照（原 src/ws/server.ts buildSnapshot 搬迁）：近 5 分钟内最新 15 条
// （created_at TEXT ISO，字典序=时间序），昵称经 profiles client 解析（60s 缓存，
// auth 故障降级 FALLBACK_NICKNAME——弹幕是易逝内容，不因资料服务抖动而拒发）。
// 依赖可注入便于 node --test。

import { type StudyRoomId } from '../domain/rooms';
import { recentMessages, type StudyRoomMessageRow } from '../data/messageRepository';
import { FALLBACK_NICKNAME, profileWithFallback, resolveProfiles } from '../../profiles/client';
import { allCounts } from './roomHub';
import { type DanmakuMessage, type ServerEvent } from './protocol';

export const SNAPSHOT_WINDOW_MS = 5 * 60_000;
export const SNAPSHOT_LIMIT = 15;

export function toDanmakuMessage(row: StudyRoomMessageRow, nickname: string): DanmakuMessage {
  return {
    id: row.id,
    roomId: row.room_id,
    userId: row.user_id,
    nickname,
    content: row.content,
    createdAt: row.created_at,
  };
}

async function nicknamesFor(userIds: ReadonlyArray<string>): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (userIds.length === 0) return result;
  let profiles: Awaited<ReturnType<typeof resolveProfiles>>;
  try {
    profiles = await resolveProfiles(userIds);
  } catch {
    for (const id of userIds) result.set(id, FALLBACK_NICKNAME);
    return result;
  }
  for (const id of userIds) {
    result.set(id, profileWithFallback(profiles.get(id) ?? null).nickname);
  }
  return result;
}

export interface SnapshotDeps {
  recent?: typeof recentMessages;
  resolve?: typeof resolveProfiles;
  counts?: () => ReturnType<typeof allCounts>;
}

export async function buildSnapshotForRoom(
  roomId: StudyRoomId,
  authed: boolean,
  deps: SnapshotDeps = {},
): Promise<ServerEvent> {
  const recent = deps.recent ?? recentMessages;
  const resolve = deps.resolve ?? resolveProfiles;
  const counts = deps.counts ?? allCounts;

  const sinceIso = new Date(Date.now() - SNAPSHOT_WINDOW_MS).toISOString();
  let rows: StudyRoomMessageRow[] = [];
  try {
    rows = await recent(roomId, sinceIso, SNAPSHOT_LIMIT);
  } catch (error) {
    console.error('[studyroom-stream] snapshot query failed', error);
  }
  const nicknames = await nicknamesFor([...new Set(rows.map((row) => row.user_id))]);
  return {
    type: 'snapshot',
    roomId,
    onlineCount: counts().find((row) => row.roomId === roomId)?.onlineCount ?? 0,
    authed,
    messages: rows.map((row) => toDanmakuMessage(row, nicknames.get(row.user_id) ?? FALLBACK_NICKNAME)),
    rooms: counts(),
  };
}