// 自习室 WS 地址解析（纯函数，node 可测）：EXPO_PUBLIC_STUDYROOM_WS_URL
// 优先（生产 wss 必填）；开发缺省 localhost:3321（安卓模拟器 10.0.2.2）。
// 省略路径时自动补 /studyroom，降低 .env 配置出错面。

export const STUDYROOM_WS_PATH = '/studyroom';
export const STUDYROOM_WS_PORT_DEFAULT = 3321;

export interface StudyRoomWsUrlEnv {
  readonly wsUrl?: string;
  readonly platformOS: string;
  /** 生产构建（__DEV__ === false）下缺省地址直接抛错，暴露漏配。 */
  readonly isDev: boolean;
}

export function resolveStudyRoomWsUrl(env: StudyRoomWsUrlEnv): string {
  const configured = env.wsUrl?.trim();
  if (configured) {
    const url = new URL(configured);
    if (url.pathname === '/' || url.pathname === '') url.pathname = STUDYROOM_WS_PATH;
    return url.toString();
  }
  if (!env.isDev) {
    throw new Error(
      '环境变量 EXPO_PUBLIC_STUDYROOM_WS_URL 未配置：生产构建必须指向自习室 WS 服务（wss://…/studyroom）。',
    );
  }
  const host = env.platformOS === 'android' ? '10.0.2.2' : 'localhost';
  return `ws://${host}:${STUDYROOM_WS_PORT_DEFAULT}${STUDYROOM_WS_PATH}`;
}

/** WS 地址 → 同源 HTTP 基地址（房间列表 GET /rooms 用）：ws:// → http://，去掉路径。 */
export function studyRoomHttpBaseOf(wsUrl: string): string {
  const url = new URL(wsUrl);
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
  url.pathname = '';
  url.search = '';
  return url.toString().replace(/\/+$/, '');
}
