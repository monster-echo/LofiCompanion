import { getDb } from '@/db';

// 弹幕持久化：写入供审计/滥用回溯，读取仅供 join 时的近窗快照
// （弹幕本身是易逝内容，不做全量历史回放）。

export interface StudyRoomMessageRow {
  id: number;
  room_id: string;
  user_id: string;
  content: string;
  created_at: string;
}

export interface InsertMessageRow {
  room_id: string;
  user_id: string;
  content: string;
  created_at: string;
}

/** 落库并返回自增 id（作为房间内单调游标 / 线格式 message.id）。 */
export async function insertMessage(row: InsertMessageRow): Promise<number> {
  const created = await getDb().studyRoomMessage.create({
    data: row,
    select: { id: true },
  });
  return created.id;
}

/**
 * 近窗快照：created_at 为 TEXT ISO（字典序 = 时间序），gte 直接字符串比较；
 * 取最新 limit 条后反转为时间升序，供客户端按序错峰上屏。
 */
export async function recentMessages(
  roomId: string,
  sinceIso: string,
  limit = 15,
): Promise<StudyRoomMessageRow[]> {
  const rows = await getDb().studyRoomMessage.findMany({
    where: { room_id: roomId, created_at: { gte: sinceIso } },
    orderBy: { id: 'desc' },
    take: limit,
    select: { id: true, room_id: true, user_id: true, content: true, created_at: true },
  });
  return rows.reverse();
}
