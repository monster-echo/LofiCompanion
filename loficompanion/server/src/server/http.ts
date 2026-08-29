import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

type ApiErrorBody = Readonly<{
  code: string;
  message: string;
  traceId: string;
  retryable: boolean;
  fieldErrors?: Readonly<Record<string, readonly string[]>>;
  retryAfterSeconds?: number;
}>;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryable = false,
    readonly fieldErrors?: Readonly<Record<string, readonly string[]>>,
    readonly retryAfterSeconds?: number,
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
    const fieldErrors = error.flatten().fieldErrors;
    return NextResponse.json({
      error: {
        code: 'VALIDATION_ERROR',
        message: validationMessage(fieldErrors),
        traceId,
        retryable: false,
        fieldErrors,
      } satisfies ApiErrorBody,
    }, { status: 400 });
  }
  if (error instanceof ApiError) {
    return NextResponse.json({
      error: {
        code: error.code,
        message: error.message,
        traceId,
        retryable: error.retryable,
        ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
        ...(error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
      } satisfies ApiErrorBody,
    }, { status: error.status });
  }
  const details = error instanceof Error
    ? { errorName: error.name, errorMessage: error.message, stack: error.stack }
    : { errorName: 'UnknownError', errorMessage: String(error) };
  console.error(JSON.stringify({
    level: 'error',
    traceId,
    message: 'Unhandled API error',
    ...details,
  }));
  return NextResponse.json({
    error: {
      code: 'INTERNAL_ERROR',
      message: '服务暂时不可用',
      traceId,
      retryable: true,
    } satisfies ApiErrorBody,
  }, { status: 500 });
}

export function validationMessage(
  fieldErrors: Readonly<Record<string, readonly string[] | undefined>>,
) {
  const messages = [...new Set(Object.values(fieldErrors).flatMap((items) => items ?? []))];
  return messages.length ? messages.join('；') : '请检查输入内容';
}

