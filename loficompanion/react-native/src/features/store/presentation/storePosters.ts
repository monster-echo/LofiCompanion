import { stateAsset } from '../../skins/domain/resolve';
import { rainyStudyRoomManifest } from '../../skins/domain/rainyStudyRoom.generated';
import type { CompanionState } from '../../skins/domain/types';

/**
 * 商店海报查找（P1-A Task 3）。P0 只内置雨夜书房的本地海报；其余皮肤
 * （sunny-classroom / midnight-workstation）资源包未随包分发，返回 null，
 * 由 UI 渲染主题化占位（不使用虚构截图）。非 Metro 环境 poster 为 0，同样按
 * 缺失处理。
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
  if (slug !== rainyStudyRoomManifest.slug) return null;
  try {
    const poster = stateAsset(rainyStudyRoomManifest, state).poster;
    return poster || null;
  } catch {
    return null;
  }
}
