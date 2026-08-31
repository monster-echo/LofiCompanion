import {
  encodeClientEvent,
  parseServerEvent,
  type ClientEvent,
  type ServerEvent,
} from '../domain/protocol';

/**
 * 自习室 WS 传输层：包一层 RN 内建全局 WebSocket（零新依赖）。
 * 连接头带 Bearer access token（RN WebSocket 构造第三参 options.headers，
 * iOS SocketRocket / Android OkHttp 原生支持）；open 期间 30s 应用层心跳。
 * 断线重连/退避由上层 controller 负责，这里只管单条连接的生命周期。
 */

export type TransportStatus = 'connecting' | 'open' | 'closed';

export interface StudyRoomTransport {
  connect(args: {
    url: string;
    token: string | null;
    onEvent: (event: ServerEvent) => void;
    onStatus: (status: TransportStatus) => void;
  }): void;
  send(event: ClientEvent): void;
  close(): void;
}

// RN WebSocket 的三参形态（uri, protocols, {headers}）由 react-native 类型与
// 运行时提供（SocketRocket/OkHttp 原生支持连接头）；tsconfig 的 dom lib 里
// DOM WebSocket 只有 1-2 参，这里显式收窄到 RN 构造签名。
type RnWebSocketCtor = new (
  url: string,
  protocols: string | string[] | null,
  options?: { headers: Record<string, string> },
) => WebSocket;

export function createRnWebSocketTransport(heartbeatMs = 30_000): StudyRoomTransport {
  let ws: WebSocket | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  function stopHeartbeat(): void {
    if (heartbeat !== null) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
  }

  return {
    connect({ url, token, onEvent, onStatus }) {
      close();
      onStatus('connecting');
      const Ctor = WebSocket as unknown as RnWebSocketCtor;
      const socket = new Ctor(url, null, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      ws = socket;
      socket.onopen = () => {
        if (ws !== socket) return;
        onStatus('open');
        heartbeat = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(encodeClientEvent({ type: 'heartbeat' }));
          }
        }, heartbeatMs);
      };
      socket.onmessage = (event) => {
        if (ws !== socket) return;
        const parsed = parseServerEvent(String(event.data));
        if (parsed !== null) onEvent(parsed);
      };
      socket.onclose = () => {
        if (ws !== socket) return;
        stopHeartbeat();
        ws = null;
        onStatus('closed');
      };
      socket.onerror = () => {
        // onclose 随后必然到达，状态统一在 onclose 收敛
      };
    },
    send(event) {
      if (ws !== null && ws.readyState === WebSocket.OPEN) {
        ws.send(encodeClientEvent(event));
      }
    },
    close() {
      stopHeartbeat();
      if (ws !== null) {
        const socket = ws;
        ws = null;
        socket.onopen = null;
        socket.onmessage = null;
        socket.onclose = null;
        socket.onerror = null;
        socket.close();
      }
    },
  };
}
