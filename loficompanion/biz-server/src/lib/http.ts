import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

// 与基础设施 server/src/server/http.ts 同构的响应封装：客户端 apiClient 按
// { data } / { error: { code, message, retryable, traceId } } 信封解析，搬迁
// 端点必须保持线格式逐字段兼容。

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

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

export function handleError(error: unknown) {
  const traceId = crypto.randomUUID();
  if (error instanceof ZodError) {
    return NextResponse.json({
      error: {
        code: 'VALIDATION_ERROR',
        message: '请求参数无效',
        traceId,
        retryable: false,
      },
    }, { status: 400 });
  }
  if (error instanceof ApiError) {
    return NextResponse.json({
      error: { code: error.code, message: error.message, traceId, retryable: error.retryable },
    }, { status: error.status });
  }
  console.error('[biz] unhandled error', traceId, error);
  return NextResponse.json({
    error: { code: 'INTERNAL_ERROR', message: '服务内部错误', traceId, retryable: true },
  }, { status: 500 });
}
