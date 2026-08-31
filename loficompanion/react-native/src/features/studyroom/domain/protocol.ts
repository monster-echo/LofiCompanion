import { isStudyRoomId, type StudyRoomId } from './rooms';

/**
 * 自习室 WS 线协议（冻结契约；biz-server 侧孪生：
 * biz-server/src/features/studyroom/server/protocol.ts）。
 * 传输：JSON 文本帧；连接 wss://<host>/studyroom?room=<roomId>，
 * 可选 Authorization: Bearer <access token>（无 token = 访客只读）。
 */

export interface DanmakuMessage {
  readonly id: number;
  readonly roomId: string;
  readonly userId: string;
  readonly nickname: string;
  readonly content: string;
  readonly createdAt: string;
}

export interface RoomCount {
  readonly roomId: StudyRoomId;
  readonly onlineCount: number;
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

/** 解析服务端帧：任何垃圾输入都返回 null，绝不抛。 */
export function parseServerEvent(raw: string): ServerEvent | null {
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof body !== 'object' || body === null) return null;
  const e = body as Record<string, unknown>;
  switch (e.type) {
    case 'snapshot': {
      if (!isStudyRoomId(e.roomId)) return null;
      if (typeof e.onlineCount !== 'number' || typeof e.authed !== 'boolean') return null;
      if (!Array.isArray(e.messages) || !Array.isArray(e.rooms)) return null;
      const messages = e.messages.filter(isDanmakuMessage);
      const rooms = e.rooms.filter(isRoomCount);
      return {
        type: 'snapshot',
        roomId: e.roomId,
        onlineCount: e.onlineCount,
        authed: e.authed,
        messages,
        rooms,
      };
    }
    case 'danmaku.new':
      return isDanmakuMessage(e.message) ? { type: 'danmaku.new', message: e.message } : null;
    case 'presence.update':
      if (!isStudyRoomId(e.roomId) || typeof e.onlineCount !== 'number') return null;
      return { type: 'presence.update', roomId: e.roomId, onlineCount: e.onlineCount };
    case 'presence.rooms': {
      if (!Array.isArray(e.rooms)) return null;
      return { type: 'presence.rooms', rooms: e.rooms.filter(isRoomCount) };
    }
    case 'danmaku.rejected': {
      if (typeof e.reason !== 'string') return null;
      const reason = e.reason as DanmakuRejectReason;
      if (!REJECT_REASONS.has(e.reason)) return null;
      const retryAfterSeconds =
        typeof e.retryAfterSeconds === 'number' ? e.retryAfterSeconds : undefined;
      return retryAfterSeconds === undefined
        ? { type: 'danmaku.rejected', reason }
        : { type: 'danmaku.rejected', reason, retryAfterSeconds };
    }
    case 'error':
      if (typeof e.code !== 'string' || typeof e.message !== 'string') return null;
      return { type: 'error', code: e.code, message: e.message };
    case 'pong':
      return { type: 'pong' };
    default:
      return null;
  }
}

const REJECT_REASONS: ReadonlySet<string> = new Set([
  'unauthorized',
  'too_long',
  'empty',
  'invalid',
  'blocked',
  'cooldown',
]);

function isDanmakuMessage(value: unknown): value is DanmakuMessage {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Record<string, unknown>;
  return (
    typeof m.id === 'number' &&
    typeof m.roomId === 'string' &&
    typeof m.userId === 'string' &&
    typeof m.nickname === 'string' &&
    typeof m.content === 'string' &&
    typeof m.createdAt === 'string'
  );
}

function isRoomCount(value: unknown): value is RoomCount {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return isStudyRoomId(r.roomId) && typeof r.onlineCount === 'number';
}

/** 序列化客户端帧；帧结构服务端 parseClientEvent 同口径白名单。 */
export function encodeClientEvent(event: ClientEvent): string {
  return JSON.stringify(event);
}
