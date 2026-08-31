import { resolveAssetUrl } from '../../../data/apiClient';
import { MUSIC_MANIFEST_OBJECT_KEY, parseMusicManifest } from '../domain/musicLibrary';
import type { MusicTrack } from '../domain/musicTypes';

/**
 * 线上曲库清单拉取（仅登录态可达：/storage/urls 是 requireAuth 接口，访客
 * resolveAssetUrl 返回 null → 空曲库，由 availableTracks 自然回退内置两首）。
 * 12h 内存缓存 + 并发合并；任何失败静默返回 []（不阻塞选曲 UI）。
 */

const TTL_MS = 12 * 60 * 60 * 1000;

let cache: { tracks: readonly MusicTrack[]; fetchedAt: number } | null = null;
let inflight: Promise<readonly MusicTrack[]> | null = null;

export async function fetchRemoteTracks(now: number): Promise<readonly MusicTrack[]> {
  if (cache && now - cache.fetchedAt < TTL_MS) return cache.tracks;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const url = await resolveAssetUrl(MUSIC_MANIFEST_OBJECT_KEY);
      if (!url) return cache?.tracks ?? [];
      const response = await fetch(url);
      if (!response.ok) return cache?.tracks ?? [];
      const tracks = parseMusicManifest(await response.json());
      cache = { tracks, fetchedAt: now };
      return tracks;
    } catch {
      return cache?.tracks ?? [];
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** 测试隔离用：清空内存缓存与在途请求。 */
export function resetMusicManifestCacheForTests(): void {
  cache = null;
  inflight = null;
}
