import { findSkinManifest } from '../../skins/domain/registry';
import { stateAsset } from '../../skins/domain/resolve';
import type { CompanionState } from '../../skins/domain/types';

/**
 * 商店海报查找（P1-A Task 3；P1 皮肤扩展起解析全部内置皮肤）。三套内置皮肤
 * （rainy-study-room / sunny-classroom / midnight-workstation）的资源包随包
 * 分发，按注册表解析本地海报；目录外皮肤返回 null，由 UI 渲染主题化占位
 * （不使用虚构截图）。非 Metro 环境 poster 为 0，同样按缺失处理。
 */

/** S15 四态切换（doc-08 §16：ready/focus/drink/complete） */
export const DETAIL_PREVIEW_STATES: readonly CompanionState[] = [
  'ready',
  'focusing',
  'drinking',
  'completed',
];

export const PREVIEW_STATE_LABELS: Readonly<Record<string, string>> = {
  ready: '准备',
  focusing: '专注',
  drinking: '喝水',
  completed: '完成',
};

export function storePoster(slug: string, state: CompanionState): number | null {
  const manifest = findSkinManifest(slug);
  if (!manifest) return null;
  try {
    const poster = stateAsset(manifest, state).poster;
    // 商店预览只面向内置皮肤（远端皮肤的预览在画廊内直接读缓存文件）
    return typeof poster === 'number' ? poster || null : null;
  } catch {
    return null;
  }
}
