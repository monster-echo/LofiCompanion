// ApiError 独立模块：原 http.ts 顶层 import 了 next/server，而 WS 进程
// （src/ws/server.ts）的导入链会经过 profiles client / service-token，
// 不能加载任何 Next API——故把纯错误类拆出，http.ts 原地 re-export 保持
// 既有 `@/lib/http` 导入方不变。

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
  }
}
