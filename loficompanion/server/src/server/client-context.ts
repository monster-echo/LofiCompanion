import { NextRequest } from 'next/server';
import { ApiError } from './http';

export type ClientPlatform = 'ios' | 'android' | 'harmonyos' | 'web';

export function getClientContext(request: NextRequest) {
  const platformHeader = request.headers.get('x-platform');
  const appId = request.headers.get('x-app-id')?.trim();
  if (!appId) {
    throw new ApiError(400, 'APP_ID_REQUIRED', '缺少 x-app-id 头：客户端必须显式声明 app_id');
  }
  const environment = request.headers.get('x-app-environment')?.trim();
  if (!environment) {
    throw new ApiError(400, 'ENVIRONMENT_REQUIRED', '缺少 x-app-environment 头：客户端必须显式声明 environment');
  }
  return {
    appId,
    environment,
    platform: isPlatform(platformHeader) ? platformHeader : 'web',
    appVersion: request.headers.get('x-app-version')?.trim() || '0.0.0',
    locale: request.headers.get('accept-language')?.split(',')[0] || 'zh-CN',
  };
}

function isPlatform(value: string | null): value is ClientPlatform {
  return value === 'ios' || value === 'android' || value === 'harmonyos' || value === 'web';
}
