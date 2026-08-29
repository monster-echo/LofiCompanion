import type {
  CompanionEventType,
  CompanionState,
  SkinEventMapping,
  SkinManifest,
  SkinStateAsset,
} from './types';

/**
 * 解析某状态的海报资产。状态缺失时回退到 defaultState 资产——调用方
 * 永远拿到非 undefined 值（清单不完整也不能让渲染崩溃）。
 */
export function stateAsset(manifest: SkinManifest, state: CompanionState): SkinStateAsset {
  const exact = manifest.states.find((asset) => asset.state === state);
  if (exact) return exact;
  const fallback =
    manifest.states.find((asset) => asset.state === manifest.defaultState) ??
    manifest.states[0];
  if (!fallback) {
    throw new Error(`皮肤 ${manifest.id} 没有任何状态资产（states 为空）`);
  }
  return fallback;
}

/** 查事件映射；清单未声明的事件返回 undefined（过期事件不补播，直接忽略）。 */
export function mappingFor(
  manifest: SkinManifest,
  eventType: CompanionEventType,
): SkinEventMapping | undefined {
  return manifest.eventMappings.find((mapping) => mapping.eventType === eventType);
}
