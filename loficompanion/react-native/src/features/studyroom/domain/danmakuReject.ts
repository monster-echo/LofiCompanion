import type { DanmakuRejectReason } from './protocol';

/**
 * 服务端 POST 错误 code → 客户端 DanmakuRejectReason 映射（SSE 单向化后，
 * 发弹幕走 HTTP，reject 不再以 danmaku.rejected 事件下推，而是读 HTTP
 * error envelope 的 { error: { code, retryAfterSeconds } }。
 * 映射后统一进 onEvent({type:'danmaku.rejected',...})，控制器既有处理零改动。
 */

export interface DanmakuReject {
  readonly reason: DanmakuRejectReason;
  readonly retryAfterSeconds?: number;
}

export function danmakuRejectFromServer(
  code: string,
  retryAfterSeconds?: number,
): DanmakuReject {
  switch (code) {
    case 'UNAUTHORIZED':
    case 'APP_MISMATCH':
      return { reason: 'unauthorized' };
    case 'TOO_LONG':
      return { reason: 'too_long' };
    case 'EMPTY':
      return { reason: 'empty' };
    case 'INVALID':
    case 'VALIDATION_ERROR':
      return { reason: 'invalid' };
    case 'BLOCKED':
      return { reason: 'blocked' };
    case 'COOLDOWN':
      return {
        reason: 'cooldown',
        ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
      };
    default:
      return { reason: 'invalid' };
  }
}