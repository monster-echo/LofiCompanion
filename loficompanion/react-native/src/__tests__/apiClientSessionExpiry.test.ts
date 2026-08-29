import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// apiClient 在模块加载期即校验 app 标识（租户隔离，见 apiClient.ts 末尾）；
// vi.hoisted 在 import 前执行，让本测试自包含、不依赖 .env。
vi.hoisted(() => {
  process.env.EXPO_PUBLIC_APP_ID ??= 'mobileui';
  process.env.EXPO_PUBLIC_APP_ENVIRONMENT ??= 'development';
});

import {
  ApiClientError,
  apiClient,
  registerSessionExpiredHandler,
  setAnonymousIdReader,
  setRefreshTokenReader,
  setSessionTokenReader,
} from '../data/apiClient';

// 401 会话过期语义（对齐 arkts ApiTransport）：/api/v1/auth/* 的 401 是凭证
// 错误（登录密码错、验证码错等），必须走表单内联错误展示，绝不能触发
// sessionExpired 回调切页/清输入；只有受保护路径的 401 才是会话失效。
// fetch 打桩，不需要真实服务器（CI 只跑单元测试）。
describe('apiClient session-expiry semantics', () => {
  let expiredCount: number;

  beforeEach(() => {
    expiredCount = 0;
    setSessionTokenReader(async () => 'stale-token');
    // 无可用 refresh token → performRefresh 直接失败，聚焦 401 分支本身
    setRefreshTokenReader(async () => null);
    setAnonymousIdReader(async () => 'test-installation');
    registerSessionExpiredHandler(() => { expiredCount += 1; });
  });

  afterEach(() => {
    registerSessionExpiredHandler(null);
    vi.unstubAllGlobals();
  });

  const unauthorizedBody = (code: string, message: string) => JSON.stringify({
    error: { code, message, retryable: false, traceId: 'test' },
  });

  it('auth 路径 401（密码错误）不触发 sessionExpired', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      unauthorizedBody('INVALID_CREDENTIALS', '账号或密码不正确'),
      { status: 401 },
    )));
    await expect(apiClient.signIn('user@test.local', 'wrong'))
      .rejects.toBeInstanceOf(ApiClientError);
    expect(expiredCount).toBe(0);
  });

  it('受保护路径 401 触发 sessionExpired', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      unauthorizedBody('SESSION_EXPIRED', '登录状态已过期'),
      { status: 401 },
    )));
    await expect(apiClient.usage()).rejects.toBeInstanceOf(ApiClientError);
    expect(expiredCount).toBe(1);
  });
});
