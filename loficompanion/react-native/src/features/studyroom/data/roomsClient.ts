import { apiClient } from '../../../data/apiClient';

/**
 * 房间目录在线数（biz 进程内 hub 经 /api/studyroom/rooms 暴露）：列表页浏览用，
 * 无需建连。轮询节奏由屏幕层决定（聚焦刷新 + 15s 兜底），这里只发单次请求。
 * 走 apiClient.requestBiz——biz base、X-App-* headers、401 自动刷新重试一并复用。
 */

export interface RoomOnlineCount {
  readonly roomId: string;
  readonly onlineCount: number;
}

export async function fetchRoomCounts(): Promise<readonly RoomOnlineCount[]> {
  const { rooms } = await apiClient.studyRoomCounts();
  return rooms
    .filter(
      (room): room is { roomId: string; onlineCount: number } =>
        typeof room.roomId === 'string' && typeof room.onlineCount === 'number',
    )
    .map((room) => ({ roomId: room.roomId, onlineCount: room.onlineCount }));
}
