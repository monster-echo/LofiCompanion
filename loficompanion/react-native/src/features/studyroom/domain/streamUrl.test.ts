import { describe, expect, it } from 'vitest';

import {
  STUDYROOM_DANMAKU_PATH,
  STUDYROOM_ROOMS_PATH,
  STUDYROOM_STREAM_PATH,
  studyroomStreamUrl,
} from './streamUrl';

// 端点地址（SSE 架构）：stream/danmaku/rooms 全部同源 biz base。

describe('studyroomStreamUrl', () => {
  it('appends the stream path to a normalized biz base', () => {
    expect(studyroomStreamUrl('https://lofi-biz.zhongbei.tech')).toBe(
      'https://lofi-biz.zhongbei.tech/api/studyroom/stream',
    );
  });

  it('strips a trailing slash from the base', () => {
    expect(studyroomStreamUrl('http://localhost:3320/')).toBe(
      'http://localhost:3320/api/studyroom/stream',
    );
  });

  it('keeps a base that already carries a path prefix intact', () => {
    expect(studyroomStreamUrl('http://localhost:3320')).toBe(
      'http://localhost:3320/api/studyroom/stream',
    );
  });

  it('exposes fixed endpoint constants for POST/rooms', () => {
    expect(STUDYROOM_STREAM_PATH).toBe('/api/studyroom/stream');
    expect(STUDYROOM_DANMAKU_PATH).toBe('/api/studyroom/danmaku');
    expect(STUDYROOM_ROOMS_PATH).toBe('/api/studyroom/rooms');
  });
});