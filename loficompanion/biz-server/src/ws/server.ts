// 自习室 WebSocket 服务：独立进程/容器（同镜像第二入口，见 Dockerfile
// wsrunner stage 与 compose.ws.yml），REST runner 不受影响。
// 导入链零 Next API（ApiError 已拆至 lib/apiError.ts）—— bare Node 可直接跑：
//   node --import ./src/ws/register.mjs --experimental-transform-types src/ws/server.ts
//
// 职责：房间 presence（内存态，单实例 v1；多副本需 Redis pub/sub，勿水平扩容）、
// 弹幕校验→落库→房间广播、近窗快照下发、token 过期主动断开。
// 鉴权：连接头 Bearer access token（复用 auth/jwt 本地验签，零在线依赖）；
// 无 token / appId 不符 = 访客（计入在线、只读）。
import { createServer, type IncomingMessage } from 'node:http';
import type { ServerResponse } from 'node:http';
import { WebSocketServer, WebSocket, type WebSocket as WebSocketConn } from 'ws';

import { STUDY_ROOM_IDS, isStudyRoomId, type StudyRoomId } from '../features/studyroom/domain/rooms';
import {
  encodeServerEvent,
  parseClientEvent,
  type DanmakuMessage,
  type RoomCount,
  type ServerEvent,
} from '../features/studyroom/server/protocol';
import { matchesBlocklist } from '../features/studyroom/server/blocklist';
import { validateDanmakuContent } from '../features/studyroom/server/validate';
import { CooldownGate } from '../features/studyroom/server/cooldown';
import {
  insertMessage,
  recentMessages,
  type StudyRoomMessageRow,
} from '../features/studyroom/data/messageRepository';
import {
  FALLBACK_NICKNAME,
  profileWithFallback,
  resolveProfiles,
} from '../features/profiles/client';
import { extractBearerToken, verifyAccessTokenWithClaims, type BizIdentity } from '../auth/jwt';
import { getAppId } from '../env';

const PORT = Number(process.env.STUDYROOM_WS_PORT?.trim() || 3321);
const PATH = '/studyroom';
// 客户端 30s 心跳一次；90s 无任何帧视为死链（terminate 会触发 close 清理）。
const HEARTBEAT_TIMEOUT_MS = 90_000;
const SWEEP_INTERVAL_MS = 15_000;
// join 快照：近 5 分钟内最新 15 条（created_at TEXT ISO，字典序=时间序）。
const SNAPSHOT_WINDOW_MS = 5 * 60_000;
const SNAPSHOT_LIMIT = 15;
const SEND_COOLDOWN_MS = 3000;
// presence 变更广播防抖；presence.rooms 周期兜底（也兼作换房 sheet 的数据源）。
const PRESENCE_DEBOUNCE_MS = 2000;
// 帧大小上限：42 码点 CJK ≈ 130B，512B 足够心跳/换房/弹幕，挡住超大帧。
const MAX_PAYLOAD_BYTES = 512;
// token 30min 过期后留 60s 宽限再断；客户端自动重连并重读新 token。
const TOKEN_EXPIRY_GRACE_MS = 60_000;

interface ConnState {
  ws: WebSocketConn;
  room: StudyRoomId;
  identity: BizIdentity | null;
  /** token 过期时刻；定时 close 由连接自身持有。 */
  expiryTimer: NodeJS.Timeout | null;
  lastSeenMs: number;
}

// presence 内存态：进程即真相，勿起两个副本。
const conns = new Set<ConnState>();
const roomMembers = new Map<StudyRoomId, Set<ConnState>>(
  STUDY_ROOM_IDS.map((id) => [id, new Set<ConnState>()]),
);
const cooldown = new CooldownGate(Date.now, SEND_COOLDOWN_MS);

function onlineCount(room: StudyRoomId): number {
  return roomMembers.get(room)?.size ?? 0;
}

function allCounts(): RoomCount[] {
  return STUDY_ROOM_IDS.map((roomId) => ({ roomId, onlineCount: onlineCount(roomId) }));
}

function send(conn: ConnState, event: ServerEvent): void {
  if (conn.ws.readyState === WebSocket.OPEN) {
    conn.ws.send(encodeServerEvent(event));
  }
}

function broadcast(room: StudyRoomId, event: ServerEvent): void {
  const encoded = encodeServerEvent(event);
  for (const member of roomMembers.get(room) ?? []) {
    if (member.ws.readyState === WebSocket.OPEN) member.ws.send(encoded);
  }
}

function broadcastAll(event: ServerEvent): void {
  const encoded = encodeServerEvent(event);
  for (const conn of conns) {
    if (conn.ws.readyState === WebSocket.OPEN) conn.ws.send(encoded);
  }
}

// ── presence 变更：脏房间集合 + 2s 防抖，避免刷屏 ─────────────────────────

const dirtyRooms = new Set<StudyRoomId>();
let presenceTimer: NodeJS.Timeout | null = null;

function schedulePresenceBroadcast(rooms: Iterable<StudyRoomId>): void {
  for (const room of rooms) dirtyRooms.add(room);
  if (presenceTimer !== null) return;
  presenceTimer = setTimeout(flushPresence, PRESENCE_DEBOUNCE_MS);
  presenceTimer.unref();
}

function flushPresence(): void {
  presenceTimer = null;
  for (const roomId of dirtyRooms) {
    broadcast(roomId, { type: 'presence.update', roomId, onlineCount: onlineCount(roomId) });
  }
  dirtyRooms.clear();
  broadcastAll({ type: 'presence.rooms', rooms: allCounts() });
}

// ── 昵称解析：复用 profiles client 的 60s 缓存；auth 故障时降级兜底昵称，
//    弹幕是易逝内容，不因资料服务抖动而拒绝发送。 ──────────────────────────

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

function toDanmakuMessage(row: StudyRoomMessageRow, nickname: string): DanmakuMessage {
  return {
    id: row.id,
    roomId: row.room_id,
    userId: row.user_id,
    nickname,
    content: row.content,
    createdAt: row.created_at,
  };
}

async function buildSnapshot(conn: ConnState): Promise<ServerEvent> {
  const sinceIso = new Date(Date.now() - SNAPSHOT_WINDOW_MS).toISOString();
  let rows: StudyRoomMessageRow[] = [];
  try {
    rows = await recentMessages(conn.room, sinceIso, SNAPSHOT_LIMIT);
  } catch (error) {
    console.error('[studyroom-ws] snapshot query failed', error);
  }
  const nicknames = await nicknamesFor([...new Set(rows.map((row) => row.user_id))]);
  return {
    type: 'snapshot',
    roomId: conn.room,
    onlineCount: onlineCount(conn.room),
    authed: conn.identity !== null,
    messages: rows.map((row) => toDanmakuMessage(row, nicknames.get(row.user_id) ?? FALLBACK_NICKNAME)),
    rooms: allCounts(),
  };
}

// ── 入站帧处理：畸形帧回 error 不踢连接；发送链 校验→黑名单→冷却→落库→广播 ──

async function handleClientEvent(conn: ConnState, raw: string): Promise<void> {
  conn.lastSeenMs = Date.now();
  const event = parseClientEvent(raw);
  if (event === null) {
    send(conn, { type: 'error', code: 'BAD_FRAME', message: '无法解析的帧' });
    return;
  }
  switch (event.type) {
    case 'heartbeat':
      send(conn, { type: 'pong' });
      return;
    case 'room.switch': {
      if (!isStudyRoomId(event.roomId) || event.roomId === conn.room) return;
      const from = conn.room;
      roomMembers.get(from)?.delete(conn);
      conn.room = event.roomId;
      roomMembers.get(conn.room)?.add(conn);
      send(conn, await buildSnapshot(conn));
      schedulePresenceBroadcast([from, conn.room]);
      return;
    }
    case 'danmaku.send': {
      if (conn.identity === null) {
        send(conn, { type: 'danmaku.rejected', reason: 'unauthorized' });
        return;
      }
      const verdict = validateDanmakuContent(event.content);
      if (!verdict.ok) {
        send(conn, { type: 'danmaku.rejected', reason: verdict.reason });
        return;
      }
      if (matchesBlocklist(verdict.content)) {
        send(conn, { type: 'danmaku.rejected', reason: 'blocked' });
        return;
      }
      const gate = cooldown.tryAcquire(conn.identity.userId);
      if (!gate.ok) {
        send(conn, {
          type: 'danmaku.rejected',
          reason: 'cooldown',
          retryAfterSeconds: gate.retryAfterSeconds,
        });
        return;
      }
      const userId = conn.identity.userId;
      const roomId = conn.room;
      const createdAt = new Date().toISOString();
      try {
        const id = await insertMessage({
          room_id: roomId,
          user_id: userId,
          content: verdict.content,
          created_at: createdAt,
        });
        const nicknames = await nicknamesFor([userId]);
        broadcast(roomId, {
          type: 'danmaku.new',
          message: toDanmakuMessage(
            { id, room_id: roomId, user_id: userId, content: verdict.content, created_at: createdAt },
            nicknames.get(userId) ?? FALLBACK_NICKNAME,
          ),
        });
      } catch (error) {
        console.error('[studyroom-ws] danmaku persist failed', error);
        send(conn, { type: 'error', code: 'STORAGE_UNAVAILABLE', message: '弹幕发送失败，请稍后再试' });
      }
      return;
    }
  }
}

// ── 连接生命周期 ──────────────────────────────────────────────────────────

function parseRoom(req: IncomingMessage): StudyRoomId | null {
  const room = new URL(req.url ?? '/', 'http://localhost').searchParams.get('room');
  return isStudyRoomId(room) ? room : null;
}

async function handleConnection(ws: WebSocketConn, req: IncomingMessage): Promise<void> {
  const room = parseRoom(req);
  if (room === null) {
    ws.close(4404, 'unknown room');
    return;
  }
  const verified = await verifyAccessTokenWithClaims(extractBearerToken(req.headers.authorization ?? null));
  let identity: BizIdentity | null = null;
  let expiresAtMs: number | null = null;
  if (verified !== null) {
    try {
      if (verified.identity.appId === getAppId()) {
        identity = verified.identity;
        expiresAtMs = verified.expiresAtMs;
      }
    } catch {
      // APP_ID 未配置（本地裸跑）→ 按访客处理，不影响只读体验
    }
  }

  const conn: ConnState = {
    ws,
    room,
    identity,
    expiryTimer: null,
    lastSeenMs: Date.now(),
  };
  conns.add(conn);
  roomMembers.get(room)?.add(conn);

  ws.on('message', (data, isBinary) => {
    if (isBinary) {
      send(conn, { type: 'error', code: 'BAD_FRAME', message: '仅支持文本帧' });
      return;
    }
    void handleClientEvent(conn, data.toString()).catch((error) => {
      console.error('[studyroom-ws] event handler failed', error);
    });
  });
  ws.on('close', () => {
    if (conn.expiryTimer !== null) clearTimeout(conn.expiryTimer);
    conns.delete(conn);
    roomMembers.get(conn.room)?.delete(conn);
    schedulePresenceBroadcast([conn.room]);
  });
  ws.on('error', () => {
    // close 事件随后必然到达，清理统一在 close 里做
  });

  schedulePresenceBroadcast([room]);
  send(conn, await buildSnapshot(conn));

  if (expiresAtMs !== null) {
    const ttlMs = expiresAtMs + TOKEN_EXPIRY_GRACE_MS - Date.now();
    if (ttlMs <= 0) {
      ws.close(1008, 'token expired');
      return;
    }
    conn.expiryTimer = setTimeout(() => ws.close(1008, 'token expired'), ttlMs);
    conn.expiryTimer.unref();
  }
}

// ── HTTP 壳：healthz 供容器探活；ws 挂 /studyroom 路径 ─────────────────────

const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
  // 房间目录 + 实时在线数（内存态）：自习室列表页浏览用，无需建连。
  // 响应沿用 { data } 信封（客户端 apiClient 同款解析习惯）。
  if (req.url === '/rooms') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(
      JSON.stringify({ data: { rooms: allCounts() } }),
    );
    return;
  }
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({
  server: httpServer,
  path: PATH,
  maxPayload: MAX_PAYLOAD_BYTES,
  verifyClient: (info, done) => {
    done(isStudyRoomId(new URL(info.req.url ?? '/', 'http://localhost').searchParams.get('room')), 4404, 'unknown room');
  },
});

wss.on('connection', (ws: WebSocketConn, req: IncomingMessage) => {
  void handleConnection(ws, req);
});

// 死链清扫 + presence 周期兜底广播（同一 interval）。
const sweeper = setInterval(() => {
  const nowMs = Date.now();
  for (const conn of conns) {
    if (nowMs - conn.lastSeenMs > HEARTBEAT_TIMEOUT_MS) conn.ws.terminate();
  }
  broadcastAll({ type: 'presence.rooms', rooms: allCounts() });
}, SWEEP_INTERVAL_MS);
sweeper.unref();

function shutdown(): void {
  for (const client of wss.clients) client.close(4409, 'server shutting down');
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[studyroom-ws] listening on ws://0.0.0.0:${PORT}${PATH}`);
});
