import { ok } from '@/lib/http';
import { allCounts } from '@/features/studyroom/server/roomHub';

export const dynamic = 'force-dynamic';

// GET /api/studyroom/rooms —— 房间目录 + 实时在线数（内存态，无需建连）。
// 响应沿用 { data: { rooms } } 信封（与旧 WS 进程的 HTTP /rooms 同形，客户端
// fetchRoomCounts 解析不变）。供自习室列表页 15s 轮询。
export async function GET() {
  return ok({ rooms: allCounts() });
}