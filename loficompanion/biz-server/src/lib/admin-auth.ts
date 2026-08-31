import type { NextRequest } from 'next/server';
import { ApiError } from './http';
import { getAppId, getBizAdminKey } from '../env';

// biz 管理通道鉴权（对齐 legacy adminContext 的调用形态）：皮肤发布脚本/
// 控制台以 `x-biz-key` 共享密钥访问 /api/v1/admin/*；租户 appId 固定来自
// 部署环境（getAppId，与 legacy「appId 永远来自已认证会话」同纪律，绝不取
// 自客户端头），发布环境来自必填的 `x-app-environment` 头（同 legacy 约定）。

export type AdminScope = Readonly<{ appId: string; environment: string }>;

export async function adminContext(request: NextRequest): Promise<AdminScope> {
  let expected: string;
  try {
    expected = getBizAdminKey();
  } catch {
    throw new ApiError(401, 'ADMIN_UNAUTHORIZED', '管理通道未配置（BIZ_ADMIN_KEY 缺失）');
  }
  if (request.headers.get('x-biz-key') !== expected) {
    throw new ApiError(401, 'ADMIN_UNAUTHORIZED', '管理通道鉴权失败');
  }
  const environment = request.headers.get('x-app-environment')?.trim();
  if (!environment) {
    throw new ApiError(400, 'ENVIRONMENT_REQUIRED', '缺少 x-app-environment 头：请先选择环境');
  }
  return { appId: getAppId(), environment };
}
