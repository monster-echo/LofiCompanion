// 弹幕发送管道（原 src/ws/server.ts danmaku.send 分支搬迁）：
// 校验 → 黑名单 → 冷却 → 落库 → 昵称解析 → 房间广播。访客鉴权由调用方
// （POST 路由 requireIdentity）前置完成。依赖可注入便于 node --test。
// 失败一律抛 ApiError → handleError 输出标准 error envelope（客户端按 code 映射）。

import type { BizIdentity } from '../../../auth/jwt';
import { ApiError } from '../../../lib/apiError';
import { type StudyRoomId } from '../domain/rooms';
import { insertMessage } from '../data/messageRepository';
import { FALLBACK_NICKNAME, profileWithFallback, resolveProfiles } from '../../profiles/client';
import { CooldownGate } from './cooldown';
import { matchesBlocklist } from './blocklist';
import { validateDanmakuContent } from './validate';
import { broadcastRoom, getCooldown } from './roomHub';
import { toDanmakuMessage } from './snapshot';
import { type DanmakuMessage } from './protocol';

export interface SendDanmakuArgs {
  roomId: StudyRoomId;
  identity: BizIdentity;
  contentRaw: unknown;
}

export interface SendDanmakuDeps {
  cooldown?: CooldownGate;
  broadcast?: (roomId: StudyRoomId, event: Parameters<typeof broadcastRoom>[1]) => void;
  insert?: typeof insertMessage;
  resolve?: typeof resolveProfiles;
}

export async function sendDanmaku(
  { roomId, identity, contentRaw }: SendDanmakuArgs,
  deps: SendDanmakuDeps = {},
): Promise<DanmakuMessage> {
  // 默认用 hub 的进程级冷却闸（WS 时代共享实例语义）：每次 POST 若新建闸，
  // 跨请求的 3s 窗口就形同虚设。
  const gate = deps.cooldown ?? getCooldown();
  const broadcast = deps.broadcast ?? broadcastRoom;
  const insert = deps.insert ?? insertMessage;
  const resolve = deps.resolve ?? resolveProfiles;

  const verdict = validateDanmakuContent(contentRaw);
  if (!verdict.ok) {
    throw new ApiError(400, verdict.reason.toUpperCase(), danmakuVerdictMessage(verdict.reason));
  }
  if (matchesBlocklist(verdict.content)) {
    throw new ApiError(403, 'BLOCKED', '内容含违规词，请修改后发送');
  }
  const gateVerdict = gate.tryAcquire(identity.userId);
  if (!gateVerdict.ok) {
    throw new ApiError(429, 'COOLDOWN', '发送太频繁，请稍后再试', false, gateVerdict.retryAfterSeconds);
  }

  const userId = identity.userId;
  const createdAt = new Date().toISOString();
  try {
    const id = await insert({
      room_id: roomId,
      user_id: userId,
      content: verdict.content,
      created_at: createdAt,
    });
    const message = toDanmakuMessage(
      { id, room_id: roomId, user_id: userId, content: verdict.content, created_at: createdAt },
      await nicknameFor(userId, resolve),
    );
    broadcast(roomId, { type: 'danmaku.new', message });
    return message;
  } catch (error) {
    console.error('[studyroom-stream] danmaku persist failed', error);
    throw new ApiError(503, 'STORAGE_UNAVAILABLE', '弹幕发送失败，请稍后再试', true);
  }
}

function danmakuVerdictMessage(reason: string): string {
  switch (reason) {
    case 'too_long':
      return '弹幕过长';
    case 'empty':
      return '弹幕为空';
    default:
      return '弹幕无效';
  }
}

async function nicknameFor(
  userId: string,
  resolve: typeof resolveProfiles,
): Promise<string> {
  try {
    const profiles = await resolve([userId]);
    return profileWithFallback(profiles.get(userId) ?? null).nickname;
  } catch {
    return FALLBACK_NICKNAME;
  }
}