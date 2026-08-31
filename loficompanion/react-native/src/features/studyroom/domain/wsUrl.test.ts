import { describe, expect, it } from 'vitest';

import { resolveStudyRoomWsUrl } from './wsUrl';

// 地址解析：env 优先（自动补 /studyroom 路径）；开发缺省按平台回落；
// 生产缺配直接抛——把漏配暴露在启动期而不是首屏白屏。

describe('resolveStudyRoomWsUrl', () => {
  it('prefers the configured env url and preserves its path', () => {
    expect(
      resolveStudyRoomWsUrl({
        wsUrl: 'wss://lofi-biz.zhongbei.tech/studyroom',
        platformOS: 'ios',
        isDev: false,
      }),
    ).toBe('wss://lofi-biz.zhongbei.tech/studyroom');
  });

  it('appends /studyroom when the env url omits the path', () => {
    expect(
      resolveStudyRoomWsUrl({
        wsUrl: 'wss://lofi-biz.zhongbei.tech',
        platformOS: 'ios',
        isDev: false,
      }),
    ).toBe('wss://lofi-biz.zhongbei.tech/studyroom');
  });

  it('throws in production when unconfigured', () => {
    expect(() =>
      resolveStudyRoomWsUrl({ platformOS: 'ios', isDev: false }),
    ).toThrowError(/EXPO_PUBLIC_STUDYROOM_WS_URL/);
  });

  it('falls back to localhost in dev, 10.0.2.2 on the android emulator', () => {
    expect(resolveStudyRoomWsUrl({ platformOS: 'ios', isDev: true })).toBe(
      'ws://localhost:3321/studyroom',
    );
    expect(resolveStudyRoomWsUrl({ platformOS: 'android', isDev: true })).toBe(
      'ws://10.0.2.2:3321/studyroom',
    );
  });

  it('treats whitespace-only env as unconfigured', () => {
    expect(resolveStudyRoomWsUrl({ wsUrl: '   ', platformOS: 'ios', isDev: true })).toBe(
      'ws://localhost:3321/studyroom',
    );
  });
});
