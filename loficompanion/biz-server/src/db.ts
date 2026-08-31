import { PrismaClient } from '@prisma/client';

// 惰性单例：首次真正访问数据库时才建连接。构建期（next build 收集路由）
// 与 Vercel preview 构建没有 DATABASE_URL 也不会失败；不查询就不连库。
// 开发热重载经 globalThis 复用实例，避免连接池耗尽。
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function getDb(): PrismaClient {
  if (globalForPrisma.prisma === undefined) {
    if (!process.env.DATABASE_URL?.trim()) {
      throw new Error('环境变量 DATABASE_URL 未配置：请指向本 app 的业务 Postgres。');
    }
    globalForPrisma.prisma = new PrismaClient();
  }
  return globalForPrisma.prisma;
}
