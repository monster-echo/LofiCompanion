import type { NextRequest } from 'next/server';
import { ApiError } from '@/lib/apiError';
import { handleError } from '@/lib/http';
import { extractBearerToken, verifyAccessTokenWithClaims, type BizIdentity } from '@/auth/jwt';
import { getAppId } from '@/env';
import { isStudyRoomId } from '@/features/studyroom/domain/rooms';
import {
  ensureHubMaintenance,
  joinRoomStream,
  type AttachedStream,
  type StreamWriter,
} from '@/features/studyroom/server/roomHub';
import { buildSnapshotForRoom } from '@/features/studyroom/server/snapshot';

export const dynamic = 'force-dynamic';

// GET /api/studyroom/stream?room=<id> —— 自习室 SSE 流（原独立 WS 进程搬迁）。
// 返回 text/event-stream；事件 = SNR 帧 `data: <json>\n\n`，线形状与旧 WS 协议一致
// （客户端 protocol.ts 孪生零改动）：
//   snapshot / presence.update / presence.rooms / danmaku.new / error(TOKEN_EXPIRED 关流)
// 鉴权：可选 Authorization: Bearer（无 token / 失效 / appId 不符 = 访客只读、计入在线）。
// token 30min 过期留 60s 宽限，到期推 error 后服务端关流 → 客户端重连重读新 token。
//
// 断开检测以 ReadableStream 的 cancel() 为准（Next standalone pipeToNodeResponse：
// 客户端断开 → res 'close' → pipe abort → 源流 cancel 触发）；request.signal abort
// 只作第二保险。任何出参必须在流开始前定格（HTTP status 一旦开流即冻结）。

export async function GET(request: NextRequest) {
  const room = request.nextUrl.searchParams.get('room');
  if (!isStudyRoomId(room)) {
    return handleError(new ApiError(400, 'INVALID_ROOM', '未知自习室'));
  }

  // token → 身份（与 WS 同口径：null = 访客），appId 校验失败同样视为访客。
  const verified = await verifyAccessTokenWithClaims(
    extractBearerToken(request.headers.get('authorization')),
  );
  let identity: BizIdentity | null = null;
  let expiresAtMs: number | null = null;
  if (verified !== null) {
    try {
      if (verified.identity.appId === getAppId()) {
        identity = verified.identity;
        expiresAtMs = verified.expiresAtMs;
      }
    } catch {
      // APP_ID 未配置（本地裸跑）→ 访客只读兜底，不影响浏览体验
    }
  }

  const encoder = new TextEncoder();
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
  let cancelled = false;
  let attached: AttachedStream | null = null;

  const writer: StreamWriter = {
    write(frame: string): boolean {
      const c = controllerRef;
      if (c === null) return false;
      try {
        c.enqueue(encoder.encode(frame));
        return true;
      } catch {
        // enqueue-after-cancel 或底层写失败 → 死流
        return false;
      }
    },
    get closed() {
      return cancelled;
    },
    close(): void {
      if (cancelled) return;
      cancelled = true;
      try {
        controllerRef?.close();
      } catch {
        // 已结束
      }
    },
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controllerRef = controller;
      try {
        controller.enqueue(encoder.encode(': ok\n\n')); // 立刻冲出响应头
      } catch {
        // start 阶段尚未具备写入条件
      }
      attached = joinRoomStream({ room, identity, expiresAtMs, writer });
      ensureHubMaintenance();
      request.signal.addEventListener('abort', () => attached?.leave(), { once: true });

      try {
        const snapshot = await buildSnapshotForRoom(room, identity !== null);
        if (!cancelled) attached?.push(snapshot);
      } catch (error) {
        // 快照失败不杀流：presence/弹幕推送照常，客户端有兜底
        console.error('[studyroom-stream] snapshot failed', error);
      }
    },
    cancel() {
      cancelled = true;
      attached?.leave();
      controllerRef = null;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}