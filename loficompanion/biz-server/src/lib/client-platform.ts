import type { NextRequest } from 'next/server';

// 客户端平台解析（x-platform 头，对齐基础设施 getClientContext 的平台口径）。
// 商店验证按此分流适配器：ios→apple / android→google / harmonyos→hms。

export type ClientPlatform = 'ios' | 'android' | 'harmonyos' | 'web';

export function getClientPlatform(request: NextRequest): ClientPlatform {
  const value = request.headers.get('x-platform');
  return value === 'ios' || value === 'android' || value === 'harmonyos' ? value : 'web';
}
