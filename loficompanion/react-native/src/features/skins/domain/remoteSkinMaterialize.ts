import type { CompanionState, SkinManifest, SkinStateAsset } from './types';

/**
 * 远端 manifest 的纯物化逻辑（node 可测）：服务端 manifest JSON
 * （posterUrl=裸 objectKey）→ 本地 SkinManifest（poster=缓存文件 uri）+
 * 状态 → objectKey 映射（下载换签用）。文件系统操作在 data/remoteSkinsRepository。
 */

/** 物化产物：manifest（poster=缓存 uri）+ 每状态的 OSS objectKey（换签下载用） */
export interface MaterializedSkin {
  manifest: SkinManifest;
  posterKeys: Readonly<Record<string, string>>;
}

export function materializeManifest(
  raw: Record<string, unknown>,
  toUri: (slug: string, version: number, state: string) => string,
): MaterializedSkin | null {
  const slug = raw.slug;
  const version = raw.manifestVersion;
  if (typeof slug !== 'string' || typeof version !== 'number') return null;
  const states = Array.isArray(raw.states) ? raw.states : [];
  const assets: SkinStateAsset[] = [];
  const posterKeys: Record<string, string> = {};
  for (const entry of states) {
    const candidate = entry as Record<string, unknown>;
    const state = candidate.state;
    const posterKey = candidate.posterUrl;
    if (typeof state !== 'string' || typeof posterKey !== 'string') return null;
    // posterUrl 必须是裸 objectKey（发布通道已保证；防御 http(s) 逃逸）
    if (/^https?:/i.test(posterKey) || /^s3:\/\//i.test(posterKey)) return null;
    assets.push({
      state: state as CompanionState,
      poster: { uri: toUri(slug, version, state) },
      focalPointX: typeof candidate.focalPointX === 'number' ? candidate.focalPointX : 0.5,
      focalPointY: typeof candidate.focalPointY === 'number' ? candidate.focalPointY : 0.38,
      durationMs: typeof candidate.durationMs === 'number' ? candidate.durationMs : 4000,
    });
    posterKeys[state] = posterKey;
  }
  if (assets.length === 0) return null;
  const tokens = (raw.themeTokens ?? {}) as Record<string, unknown>;
  return {
    manifest: {
      id: typeof raw.id === 'string' ? raw.id : `${slug}-v${version}`,
      slug,
      name: typeof raw.name === 'string' ? raw.name : slug,
      accessType: raw.accessType === 'paid' || raw.accessType === 'premium' ? raw.accessType : 'free',
      manifestVersion: version,
      defaultState: (typeof raw.defaultState === 'string' ? raw.defaultState : 'ready') as CompanionState,
      states: assets,
      eventMappings: [],
      themeTokens: {
        accent: typeof tokens.accent === 'string' ? tokens.accent : '#4F8FE8',
        surface: typeof tokens.surface === 'string' ? tokens.surface : '#0D1B2B',
      },
    },
    posterKeys,
  };
}
