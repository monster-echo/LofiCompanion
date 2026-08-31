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

/** auth 内部接口共享密钥（x-internal-key）：biz 查询用户资料用；两侧 env 对齐。
 *  运行时必填，缺失时在首次使用处抛出。 */
export function getInternalApiKey(): string {
  const value = process.env.INTERNAL_API_KEY?.trim();
  if (!value) {
    throw new Error('环境变量 INTERNAL_API_KEY 未配置：请设置为与 auth 侧对齐的内部共享密钥。');
  }
  return value;
}

// 基础设施内部接口地址：默认跟随 AUTH_BASE_URL；本地联调时 biz 的 JWT 需要
// 生产 JWKS、而内部资料接口需要本地 auth（密钥两侧对齐），此时单独覆写。
export function getAuthInternalBaseUrl(): string {
  return (process.env.AUTH_INTERNAL_BASE_URL?.trim() || AUTH_BASE_URL).replace(/\/+$/, '');
}
