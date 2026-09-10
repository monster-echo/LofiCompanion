/**
 * 卡片缩略图 objectKey 约定（纯函数，node 可测）。与 biz-server
 * src/features/skins/data/thumb-key.ts 双端同约：
 *   poster「<dir>/<name>.<ext>」→「<dir>/<name>.thumb.jpg」（960 宽 JPEG，
 *   由 biz 发布/回填管线生成）。客户端只用派生 key 换签下载，本地缓存文件
 *   命名（<state>.thumb.jpg）由 remoteSkinsRepository 决定。
 */

/** 「<dir>/<name>.<ext>」→「<dir>/<name>.thumb.jpg」；无文件名段/隐藏文件返回 null */
export function deriveThumbKey(posterKey: string): string | null {
  const slash = posterKey.lastIndexOf('/');
  const base = slash >= 0 ? posterKey.slice(slash + 1) : posterKey;
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  if (!stem || stem.startsWith('.')) return null;
  const dir = slash >= 0 ? posterKey.slice(0, slash + 1) : '';
  return `${dir}${stem}.thumb.jpg`;
}
