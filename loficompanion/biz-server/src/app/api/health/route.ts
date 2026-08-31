// 存活探针：不依赖数据库（DB 连接异常时容器仍可被观测）。
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ status: 'ok' });
}
