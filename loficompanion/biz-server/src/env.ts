// 环境变量集中读取。规则：模块导入必须零副作用（next build 收集路由时不
// 要求任何环境变量）；运行时真正用到某配置时才校验并显式报错。

// 必须与基础设施 server 签发 JWT 的 issuer 一致
// （server/src/server/jwt.ts：AUTH_PUBLIC_ORIGIN 或默认 https://auth.zhongbei.tech）。
export const AUTH_BASE_URL = (
  process.env.AUTH_BASE_URL?.trim() || 'https://auth.zhongbei.tech'
).replace(/\/+$/, '');

// 必须与基础设施 JWT_AUDIENCE 一致（默认 dsh-pocket）。
export const JWT_AUDIENCE = process.env.JWT_AUDIENCE?.trim() || 'dsh-pocket';

export const APP_VERSION = process.env.APP_VERSION?.trim() || '1.0.0';

/** 本 app 的租户 id：运行时必填，缺失时在首次使用处抛出。 */
export function getAppId(): string {
  const value = process.env.APP_ID?.trim();
  if (!value) {
    throw new Error('环境变量 APP_ID 未配置：请在 .env 或部署环境中设置后再启动。');
  }
  return value;
}
