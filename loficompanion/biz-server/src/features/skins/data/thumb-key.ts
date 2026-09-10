// 皮肤卡片缩略图 objectKey 约定（纯函数，零依赖——node 直测）。
// 与 RN 客户端 src/features/skins/domain/thumbKey.ts 双端同约：
//   poster「<dir>/<name>.<ext>」→「<dir>/<name>.thumb.jpg」
// 派生 key 与 poster 同目录 → 租户前缀天然一致（poster 已过发布通道校验）。
// thumb 是纯派生产物：丢失/损坏随时可由原图重建，manifest/DB 不落任何新字段。

/** 卡片渲染目标：960px 宽（3x 屏 358pt 卡需 ~1074px，960 轻微上采样可接受） */
export const THUMB_WIDTH = 960;

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

interface PosterStatesLike {
  states?: Array<{ state?: unknown; posterUrl?: unknown }>;
}

/** 从 manifest JSON 结构收集全部状态的非空 posterUrl（发布后的 manifest 已过校验） */
export function posterKeysOf(manifest: unknown): string[] {
  const states = (manifest as PosterStatesLike | null)?.states;
  if (!Array.isArray(states)) return [];
  return states
    .map((state) => (typeof state.posterUrl === 'string' ? state.posterUrl : ''))
    .filter((key) => key.length > 0);
}

export interface ThumbReport {
  generated: number;
  exists: number;
  failed: number;
}
