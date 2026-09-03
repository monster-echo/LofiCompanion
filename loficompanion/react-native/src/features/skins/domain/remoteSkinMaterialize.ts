import type {
  CompanionEventType,
  CompanionState,
  SkinEventMapping,
  SkinManifest,
  SkinStateAsset,
} from './types';

/**
 * 远端 manifest 的纯物化逻辑（node 可测）：服务端 manifest JSON
 * （posterUrl/videoUrl=裸 objectKey）→ 本地 SkinManifest（poster/video=缓存
 * 文件 uri）+ 状态 → objectKey 映射（下载换签用）。文件系统操作在
 * data/remoteSkinsRepository。
 *
 * 云端化后远端清单携带完整语义（与内置 skin.yaml 同构）：事件表、动画参数、
 * 健康排程、英文名；缺省段回退内置默认值（事件空表、默认主题色）。
 */

/** 物化产物：manifest（poster/video=缓存 uri）+ 每状态的 OSS objectKey（换签下载用） */
export interface MaterializedSkin {
  manifest: SkinManifest;
  posterKeys: Readonly<Record<string, string>>;
  videoKeys: Readonly<Record<string, string>>;
}

/** 已知事件类型白名单：过期/未知事件直接丢弃（映射表缺省事件被忽略是既有语义） */
const KNOWN_EVENTS: readonly CompanionEventType[] = [
  'session.ready',
  'focus.started',
  'focus.loop',
  'wellness.drink',
  'focus.paused',
  'break.started',
  'focus.resumed',
  'focus.completed',
];

/** 裸 objectKey 防逃逸：http(s)/s3:// 形态一律拒（发布通道已保证；纵深防御） */
function isBareObjectKey(value: string): boolean {
  return !/^https?:/i.test(value) && !/^s3:\/\//i.test(value);
}

function parseEventMappings(raw: unknown): SkinEventMapping[] {
  if (!Array.isArray(raw)) return [];
  const mappings: SkinEventMapping[] = [];
  for (const entry of raw) {
    const candidate = entry as Record<string, unknown>;
    const eventType = candidate.eventType;
    if (typeof eventType !== 'string' || !KNOWN_EVENTS.includes(eventType as CompanionEventType)) {
      continue;
    }
    if (typeof candidate.priority !== 'number' || typeof candidate.interruptible !== 'boolean') {
      continue;
    }
    mappings.push({
      eventType: eventType as CompanionEventType,
      priority: candidate.priority,
      interruptible: candidate.interruptible,
      cooldownSeconds: typeof candidate.cooldownSeconds === 'number' ? candidate.cooldownSeconds : 0,
      returnState: (typeof candidate.returnState === 'string'
        ? candidate.returnState
        : 'ready') as CompanionState,
    });
  }
  return mappings;
}

export function materializeManifest(
  raw: Record<string, unknown>,
  toUri: (slug: string, version: number, state: string) => string,
  toVideoUri: (slug: string, version: number, state: string) => string,
): MaterializedSkin | null {
  const slug = raw.slug;
  const version = raw.manifestVersion;
  if (typeof slug !== 'string' || typeof version !== 'number') return null;
  const states = Array.isArray(raw.states) ? raw.states : [];
  const assets: SkinStateAsset[] = [];
  const posterKeys: Record<string, string> = {};
  const videoKeys: Record<string, string> = {};
  for (const entry of states) {
    const candidate = entry as Record<string, unknown>;
    const state = candidate.state;
    const posterKey = candidate.posterUrl;
    if (typeof state !== 'string' || typeof posterKey !== 'string') return null;
    if (!isBareObjectKey(posterKey)) return null;
    // videoUrl 可选；携带时必须同为裸 objectKey（逃逸形态与 poster 同罪：整单拒绝）
    if (typeof candidate.videoUrl === 'string' && !isBareObjectKey(candidate.videoUrl)) return null;
    const videoKey = typeof candidate.videoUrl === 'string' ? candidate.videoUrl : null;
    assets.push({
      state: state as CompanionState,
      poster: { uri: toUri(slug, version, state) },
      ...(videoKey
        ? { loopVideo: { uri: toVideoUri(slug, version, state) }, videoLoop: candidate.videoLoop !== false }
        : {}),
      focalPointX: typeof candidate.focalPointX === 'number' ? candidate.focalPointX : 0.5,
      focalPointY: typeof candidate.focalPointY === 'number' ? candidate.focalPointY : 0.38,
      durationMs: typeof candidate.durationMs === 'number' ? candidate.durationMs : 4000,
    });
    posterKeys[state] = posterKey;
    if (videoKey) videoKeys[state] = videoKey;
  }
  if (assets.length === 0) return null;
  const tokens = (raw.themeTokens ?? {}) as Record<string, unknown>;
  const animation = (raw.animation ?? {}) as Record<string, unknown>;
  const autoDrink = ((raw.wellness ?? {}) as Record<string, unknown>).autoDrink as
    | Record<string, unknown>
    | undefined;
  return {
    manifest: {
      id: typeof raw.id === 'string' ? raw.id : `${slug}-v${version}`,
      slug,
      name: typeof raw.name === 'string' ? raw.name : slug,
      nameEn: typeof raw.nameEn === 'string' ? raw.nameEn : undefined,
      accessType: raw.accessType === 'paid' || raw.accessType === 'premium' ? raw.accessType : 'free',
      manifestVersion: version,
      defaultState: (typeof raw.defaultState === 'string' ? raw.defaultState : 'ready') as CompanionState,
      states: assets,
      eventMappings: parseEventMappings(raw.eventMappings),
      themeTokens: {
        accent: typeof tokens.accent === 'string' ? tokens.accent : '#4F8FE8',
        surface: typeof tokens.surface === 'string' ? tokens.surface : '#0D1B2B',
      },
      ...(typeof animation.crossfadeMs === 'number' && typeof animation.focalZoom === 'number'
        ? { animation: { crossfadeMs: animation.crossfadeMs, focalZoom: animation.focalZoom } }
        : {}),
      ...(autoDrink
        ? {
            wellness: {
              autoDrink: {
                enabled: autoDrink.enabled === true,
                minIntervalMinutes: typeof autoDrink.minIntervalMinutes === 'number'
                  ? autoDrink.minIntervalMinutes
                  : 20,
                maxIntervalMinutes: typeof autoDrink.maxIntervalMinutes === 'number'
                  ? autoDrink.maxIntervalMinutes
                  : 32,
              },
            },
          }
        : {}),
    },
    posterKeys,
    videoKeys,
  };
}
