// 自习室 WS 线协议（冻结契约；RN 侧孪生：
// react-native/src/features/studyroom/domain/protocol.ts）。
// 传输：JSON 文本帧；连接 wss://<host>/studyroom?room=<roomId>，
// 可选 Authorization: Bearer <access token>（无 token = 访客只读）。
//
// C→S: heartbeat / danmaku.send{content} / room.switch{roomId}
// S→C: snapshot / danmaku.new / presence.update / presence.rooms
//      / danmaku.rejected / error / pong
// 关闭码：4404 坏房间（握手前 verifyClient 拒绝）；4409 服务停机。
// 畸形帧只回 error 事件，不踢连接。

import { isStudyRoomId, type StudyRoomId } from '../domain/rooms';

export interface DanmakuMessage {
  id: number;
  roomId: string;
  userId: string;
  nickname: string;
  content: string;
  createdAt: string;
}

export interface RoomCount {
  roomId: StudyRoomId;
  onlineCount: number;
}

export type DanmakuRejectReason =
  | 'unauthorized'
  | 'too_long'
  | 'empty'
  | 'invalid'
  | 'blocked'
  | 'cooldown';

export type ClientEvent =
  | { type: 'heartbeat' }
  | { type: 'danmaku.send'; content: string }
  | { type: 'room.switch'; roomId: string };

export type ServerEvent =
  | {
      type: 'snapshot';
      roomId: StudyRoomId;
      onlineCount: number;
      authed: boolean;
      messages: DanmakuMessage[];
      rooms: RoomCount[];
    }
  | { type: 'danmaku.new'; message: DanmakuMessage }
  | { type: 'presence.update'; roomId: StudyRoomId; onlineCount: number }
  | { type: 'presence.rooms'; rooms: RoomCount[] }
  | { type: 'danmaku.rejected'; reason: DanmakuRejectReason; retryAfterSeconds?: number }
  | { type: 'error'; code: string; message: string }
  | { type: 'pong' };

/** 解析客户端帧：任何垃圾输入都返回 null，绝不抛（畸形帧不踢连接）。 */
export function parseClientEvent(raw: string): ClientEvent | null {
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof body !== 'object' || body === null) return null;
  const candidate = body as { type?: unknown; content?: unknown; roomId?: unknown };
  switch (candidate.type) {
    case 'heartbeat':
      return { type: 'heartbeat' };
    case 'danmaku.send':
      if (typeof candidate.content !== 'string') return null;
      return { type: 'danmaku.send', content: candidate.content };
    case 'room.switch':
      if (!isStudyRoomId(candidate.roomId)) return null;
      return { type: 'room.switch', roomId: candidate.roomId };
    default:
      return null;
  }
}

/** 序列化服务端事件；payload 不含 BigInt，JSON.stringify 恒安全。 */
export function encodeServerEvent(event: ServerEvent): string {
  return JSON.stringify(event);
}
