import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // apiClient 模块加载即校验 app_id/environment（tsc 层面的启动契约）。
    // 此前由 apiClientSessionExpiry.test.ts 以 `??=` 就地补设——依赖同 worker
    // 的文件调度顺序，新增测试文件后暴露为偶发整批失败。这里显式固定，
    // 使任意子集/全量运行结果一致。
    env: {
      EXPO_PUBLIC_APP_ID: 'mobileui',
      EXPO_PUBLIC_APP_ENVIRONMENT: 'development',
    },
  },
});
