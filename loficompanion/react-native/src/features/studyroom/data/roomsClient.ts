import { studyRoomHttpBaseOf } from '../domain/wsUrl';

/**
 * 房间目录在线数（WS 服务的内存态经同源 HTTP 暴露）：列表页浏览用，
 * 无需建连。GET /rooms → { data: { rooms: [{ roomId, onlineCount }] } }。
 * 轮询节奏由屏幕层决定（聚焦刷新 + 15s 兜底），这里只发单次请求。
 */

export interface RoomOnlineCount {
  readonly roomId: string;
  readonly onlineCount: number;
}

export async function fetchRoomCounts(httpBase: string): Promise<readonly RoomOnlineCount[]> {
  const response = await fetch(`${httpBase}/rooms`);
  if (!response.ok) {
    throw new Error(`rooms unavailable: ${response.status}`);
  }
  const body = (await response.json()) as {
    data?: { rooms?: Array<{ roomId?: unknown; onlineCount?: unknown }> };
  };
  const rooms = body.data?.rooms ?? [];
  return rooms
    .filter(
      (room): room is { roomId: string; onlineCount: number } =>
        typeof room.roomId === 'string' && typeof room.onlineCount === 'number',
    )
    .map((room) => ({ roomId: room.roomId, onlineCount: room.onlineCount }));
}
