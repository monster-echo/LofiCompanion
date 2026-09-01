import { describe, expect, it } from 'vitest';

import { danmakuRejectFromServer } from './danmakuReject';

// 服务端 POST 错误 code → DanmakuRejectReason 映射（含 retryAfterSeconds 透传）。

describe('danmakuRejectFromServer', () => {
  it('maps auth and tenant errors to unauthorized', () => {
    expect(danmakuRejectFromServer('UNAUTHORIZED')).toEqual({ reason: 'unauthorized' });
    expect(danmakuRejectFromServer('APP_MISMATCH')).toEqual({ reason: 'unauthorized' });
  });

  it('maps length/text errors to their verbatim reasons', () => {
    expect(danmakuRejectFromServer('TOO_LONG')).toEqual({ reason: 'too_long' });
    expect(danmakuRejectFromServer('EMPTY')).toEqual({ reason: 'empty' });
    expect(danmakuRejectFromServer('INVALID')).toEqual({ reason: 'invalid' });
    expect(danmakuRejectFromServer('VALIDATION_ERROR')).toEqual({ reason: 'invalid' });
  });

  it('maps blocked', () => {
    expect(danmakuRejectFromServer('BLOCKED')).toEqual({ reason: 'blocked' });
  });

  it('maps cooldown and passes retryAfterSeconds through', () => {
    expect(danmakuRejectFromServer('COOLDOWN', 4)).toEqual({
      reason: 'cooldown',
      retryAfterSeconds: 4,
    });
    expect(danmakuRejectFromServer('COOLDOWN')).toEqual({ reason: 'cooldown' });
  });

  it('falls back to invalid for unknown codes', () => {
    expect(danmakuRejectFromServer('SOMETHING_NEW')).toEqual({ reason: 'invalid' });
    expect(danmakuRejectFromServer('')).toEqual({ reason: 'invalid' });
  });
});