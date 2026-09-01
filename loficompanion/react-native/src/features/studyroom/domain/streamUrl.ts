/**
 * 自习室端点地址（SSE 架构，2026-09 起承载在 biz-server 同一 Next 进程里，
 * 不再有独立 WS 端口）。所有端点共用 biz base（EXPO_PUBLIC_BIZ_API_URL）——
 * 原本的 EXPO_PUBLIC_STUDYROOM_WS_URL 独立配置线已删除。
 */

export const STUDYROOM_STREAM_PATH = '/api/studyroom/stream';
export const STUDYROOM_DANMAKU_PATH = '/api/studyroom/danmaku';
export const STUDYROOM_ROOMS_PATH = '/api/studyroom/rooms';

/** SSE 流地址（controller 会把 ?room=<id> 追加到返回值上）。 */
export function studyroomStreamUrl(bizBase: string): string {
  return `${bizBase.replace(/\/+$/, '')}${STUDYROOM_STREAM_PATH}`;
}