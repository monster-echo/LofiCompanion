import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import type { AudioPlayer, AudioSource } from 'expo-audio';
import { invalidateAssetUrl, resolveAssetUrl } from '../../../data/apiClient';
import { BUNDLED_TRACKS } from './bundledTracks';
import type { MusicController } from '../domain/musicController';
import type { MusicTrack } from '../domain/musicTypes';

/**
 * expo-audio 实现的音乐控制器（FocusStore 经 deps.music 注入 orchestrate）。
 *
 * 语义（FocusMusicEffects 契约）：
 *  - sessionActive && !muted = 「想听」；任一条件翻转立即暂停/恢复，
 *    静音不丢意图（desiredPlaying 由两个布尔推导，恢复即续播）。
 *  - 远端曲目播放地址 24h 预签名：恢复时超 12h 强制重签；播放出错重签一次，
 *    仍失败回退内置首曲（不阻塞专注流程）。
 *  - 播放器懒创建 + loop=true：循环由原生层完成（后台无 JS 定时器也不断）。
 */

/** 预签名 GET 有效 24h：半日以上的暂停恢复时强制重换地址 */
const URL_TTL_MS = 12 * 60 * 60 * 1000;
/** 混音电平：音乐是陪伴层（未来雨声环境音在其上再叠），绝不盖过提示音 */
const MUSIC_VOLUME = 0.6;

export interface MusicControllerDeps {
  /** 注入测试桩；缺省走 apiClient 的会话级缓存签发路径 */
  resolveUrl?: (objectKey: string, opts?: { fresh?: boolean }) => Promise<string | null>;
}

async function defaultResolveUrl(
  objectKey: string,
  opts?: { fresh?: boolean },
): Promise<string | null> {
  if (opts?.fresh) invalidateAssetUrl(objectKey);
  return resolveAssetUrl(objectKey);
}

export function createExpoAudioMusicController(
  deps: MusicControllerDeps = {},
): MusicController {
  const resolveUrl = deps.resolveUrl ?? defaultResolveUrl;

  let player: AudioPlayer | null = null;
  let audioModeReady = false;
  let sessionActive = false;
  /** 氛围在场（自习室）：房间本身即「在听」场景，无需专注会话 */
  let ambientActive = false;
  /** 画面门控：仅专注画面/自习室聚焦时出声（首页/成就/我的恒静默） */
  let screenActive = false;
  let muted = false;
  /** 当前曲目（null = 尚未确定，apply 时落首个内置） */
  let current: MusicTrack | null = null;
  /** 已加载到播放器的源标识：`bundled:<id>` 或 objectKey（换曲/重签才 replace） */
  let loadedKey: string | null = null;
  let resolvedAt = 0;
  /** 竞态防护：异步换曲完成后若已再次换曲则丢弃本次结果 */
  let loadSeq = 0;

  async function ensureAudioMode(): Promise<void> {
    if (audioModeReady) return;
    audioModeReady = true;
    try {
      // 显式用户开启的陪伴声（同冥想类应用）：静音键拨片不压制；
      // 与播客等第三方音频混播不抢焦点；后台续播由 UIBackgroundModes=audio 兜底
      await setAudioModeAsync({
        playsInSilentMode: true,
        interruptionMode: 'mixWithOthers',
        shouldPlayInBackground: true,
      });
    } catch {
      // 音频模式设置失败不阻塞（部分平台/web 有限制），播放尽力而为
    }
  }

  function ensurePlayer(): AudioPlayer | null {
    if (player) return player;
    try {
      player = createAudioPlayer(null);
      player.loop = true;
      player.volume = MUSIC_VOLUME;
    } catch {
      player = null;
    }
    return player;
  }

  /** 解析当前曲目应播放的源；远端解析失败 → 回退内置首曲（null = 无声可播） */
  async function sourceFor(
    track: MusicTrack,
    opts: { freshUrl?: boolean },
  ): Promise<{ source: AudioSource; key: string } | null> {
    if (track.source === 'bundled') {
      if (!track.bundledModule) return null; // node/vitest 环境 require 为 0
      return { source: track.bundledModule, key: `bundled:${track.id}` };
    }
    if (!track.objectKey) return null;
    const fresh = opts.freshUrl === true || Date.now() - resolvedAt > URL_TTL_MS;
    const url = await resolveUrl(track.objectKey, { fresh }).catch(() => null);
    if (url) {
      resolvedAt = Date.now();
      return { source: { uri: url }, key: track.objectKey };
    }
    const fallback = BUNDLED_TRACKS[0];
    if (!fallback?.bundledModule) return null;
    return { source: fallback.bundledModule, key: `bundled:${fallback.id}` };
  }

  /** 把播放器对齐到（当前曲目 × 想听与否）的目标态；loadSeq 防换曲竞态 */
  async function apply(shouldPlay: boolean, opts: { freshUrl?: boolean } = {}): Promise<void> {
    const target = current ?? BUNDLED_TRACKS[0] ?? null;
    if (!target) return;
    const seq = ++loadSeq;
    await ensureAudioMode();
    const activePlayer = ensurePlayer();
    if (!activePlayer) return;
    try {
      const resolved = await sourceFor(target, opts);
      if (seq !== loadSeq) return; // 期间又换曲/重置：丢弃本次加载
      if (!resolved) return;
      if (loadedKey !== resolved.key) {
        activePlayer.replace(resolved.source);
        loadedKey = resolved.key;
      }
      if (shouldPlay) activePlayer.play();
      else activePlayer.pause();
    } catch {
      // 加载失败保持现状（静音/暂停态），下一次事件再试
    }
  }

  function sync(): void {
    void apply((sessionActive || ambientActive) && screenActive && !muted);
  }

  return {
    sessionStarted() {
      sessionActive = true;
      sync();
    },
    paused() {
      sessionActive = false;
      sync();
    },
    resumed() {
      sessionActive = true;
      sync();
    },
    sessionEnded() {
      sessionActive = false;
      sync();
    },
    setScreenActive(active: boolean) {
      screenActive = active;
      sync();
    },
    setAmbientActive(active: boolean) {
      ambientActive = active;
      sync();
    },
    setMuted(next: boolean) {
      muted = next;
      sync();
    },
    selectTrack(track: MusicTrack) {
      if (current?.id === track.id && current.source === track.source) return;
      current = track;
      loadedKey = null;
      resolvedAt = 0;
      sync();
    },
    dispose() {
      loadSeq += 1;
      try {
        player?.remove();
      } catch {
        // 已释放/未创建：忽略
      }
      player = null;
      loadedKey = null;
      sessionActive = false;
    },
  };
}

/** 模块级单例：FocusStore（生命周期接线）与选曲 UI 共享同一播放器实例。 */
let singleton: MusicController | null = null;

export function getMusicController(): MusicController {
  if (!singleton) singleton = createExpoAudioMusicController();
  return singleton;
}
