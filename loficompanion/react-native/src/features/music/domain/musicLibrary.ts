import type { MusicTrack } from './musicTypes';

/**
 * 曲库纯逻辑（node 可测）：线上清单解析、内置/远端合并、选曲解析。
 * objectKey 纪律：/storage/urls 只认本 app 前缀的 key，任何 http(s) 形态
 * 一律丢弃——防止清单被篡改成任意 URL 绕过租户隔离。
 */

export const MUSIC_MANIFEST_OBJECT_KEY =
  'loficompanion/production/music/v1/manifest.json';

/** 保守校验：与上传侧 manifest.json 的 id 命名（kebab-case）一致 */
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** 线上清单（docs/licenses/LOFI-MUSIC-LICENSES.md 有完整字段说明）的容错解析 */
export function parseMusicManifest(raw: unknown): readonly MusicTrack[] {
  const entries: unknown[] = Array.isArray(raw)
    ? raw
    : raw !== null && typeof raw === 'object' && Array.isArray((raw as { tracks?: unknown }).tracks)
      ? (raw as { tracks: unknown[] }).tracks
      : [];
  const tracks: MusicTrack[] = [];
  for (const entry of entries) {
    if (entry === null || typeof entry !== 'object') continue;
    const { id, title, artist, objectKey } = entry as Record<string, unknown>;
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) continue;
    if (typeof objectKey !== 'string' || objectKey.length === 0) continue;
    if (/^https?:/i.test(objectKey) || /^s3:\/\//i.test(objectKey)) continue;
    tracks.push({
      id,
      title: typeof title === 'string' && title.length > 0 ? title : id,
      artist: typeof artist === 'string' ? artist : undefined,
      source: 'remote',
      objectKey,
    });
  }
  return tracks;
}

/** 内置 + 远端合并：访客只有内置；同 id 内置优先（离线可用、免签地址）。 */
export function availableTracks(
  bundled: readonly MusicTrack[],
  remote: readonly MusicTrack[],
  signedIn: boolean,
): readonly MusicTrack[] {
  if (!signedIn) return bundled;
  const bundledIds = new Set(bundled.map((track) => track.id));
  return [...bundled, ...remote.filter((track) => !bundledIds.has(track.id))];
}

/** 选曲解析：未知/未选 → 首个内置（缺省 rainy-night）；空曲库 → null。 */
export function resolveSelectedTrack(
  selectedId: string | null,
  tracks: readonly MusicTrack[],
): MusicTrack | null {
  if (selectedId) {
    const hit = tracks.find((track) => track.id === selectedId);
    if (hit) return hit;
  }
  return tracks[0] ?? null;
}
