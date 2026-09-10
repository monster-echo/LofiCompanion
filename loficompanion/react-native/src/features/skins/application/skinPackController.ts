import { telemetry } from '../../../telemetry/Telemetry';
import type { PackProgress } from '../data/remoteSkinsRepository';
import type { SkinManifest } from '../domain/types';

/**
 * 资源包下载状态机（可观察、node 可测）：详情页「下载资源包并使用」的唯一
 * 真相源。同 slug 并发共享同一 in-flight promise（幂等）；不同 slug 下载中
 * 互斥（busy 拒绝，不排队——详情页是唯一入口，争用罕见）。statusFor 返回
 * 稳定引用 + 节流通知：useSyncExternalStore 下进度回调（每 chunk 一次）不会
 * 引发逐帧重渲染；phase 变化绕过节流立即通知。
 *
 * 「已物化」不在状态机里表达——registry 成员资格是唯一真源，成功即回调
 * onPackReady（FocusStore 注入 upsertRemote + reattachSkinCatalog）并复位 idle。
 */

export type SkinPackPhase = 'idle' | 'downloading' | 'failed';
export type SkinPackErrorKind = 'network' | 'gated' | 'manifest' | 'busy';

export interface SkinPackStatus {
  readonly phase: SkinPackPhase;
  readonly assetsDone: number;
  readonly assetsTotal: number;
  /** 0..1；idle 时恒 0 */
  readonly ratio: number;
  /** 仅 failed 携带，UI 据此选文案/色调 */
  readonly errorKind?: SkinPackErrorKind;
}

/** 资源包下载失败（含 busy 拒绝），kind 供 UI 选文案/色调 */
export class SkinPackError extends Error {
  constructor(
    readonly kind: SkinPackErrorKind,
    message: string,
  ) {
    super(message);
  }
}

export interface SkinPackControllerDeps {
  /** 仓储单包下载（401/403 原样上抛 → gated） */
  downloadPack(
    slug: string,
    sink?: { onProgress?: (progress: PackProgress) => void },
  ): Promise<SkinManifest>;
  /** 成功后先于 resolve 调用：把 manifest 并入注册表并重挂选肤 */
  onPackReady(manifest: SkinManifest): void;
  /** 测试注入时钟 */
  now?: () => number;
}

export interface SkinPackController {
  statusFor(slug: string): SkinPackStatus;
  subscribe(listener: () => void): () => void;
  downloadPack(slug: string): Promise<SkinManifest>;
}

/** 进度通知节流窗口：进度回调每 chunk 一次，80ms 合批对进度条足够平滑 */
const NOTIFY_THROTTLE_MS = 80;

const IDLE: SkinPackStatus = { phase: 'idle', assetsDone: 0, assetsTotal: 0, ratio: 0 };

/** 错误 → UI 可读类别（鸭子类型读 status/code，保持 node 可测不依赖 apiClient） */
function classify(error: unknown): SkinPackErrorKind {
  const candidate = error as { status?: number; code?: string };
  if (candidate?.status === 401 || candidate?.status === 403) return 'gated';
  if (candidate?.status === 0 || candidate?.code === 'SERVICE_UNAVAILABLE') return 'network';
  if (error instanceof Error && /地址解析失败|网络/.test(error.message)) return 'network';
  return 'manifest';
}

export function createSkinPackController(deps: SkinPackControllerDeps): SkinPackController {
  const now = deps.now ?? Date.now;
  const statuses = new Map<string, SkinPackStatus>();
  const inflight = new Map<string, Promise<SkinManifest>>();
  const listeners = new Set<() => void>();
  let notifyTimer: ReturnType<typeof setTimeout> | null = null;

  function setStatus(slug: string, status: SkinPackStatus): void {
    statuses.set(slug, status);
    notifyListeners();
  }

  /** 80ms 合批；phase 变化（终态）由调用方直呼 notifyListeners 立即送达 */
  function notifyListeners(): void {
    if (notifyTimer) return;
    notifyTimer = setTimeout(() => {
      notifyTimer = null;
      for (const listener of listeners) listener();
    }, NOTIFY_THROTTLE_MS);
  }

  function notifyNow(): void {
    if (notifyTimer) {
      clearTimeout(notifyTimer);
      notifyTimer = null;
    }
    for (const listener of listeners) listener();
  }

  return {
    statusFor(slug: string): SkinPackStatus {
      return statuses.get(slug) ?? IDLE;
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    downloadPack(slug: string): Promise<SkinManifest> {
      const existing = inflight.get(slug);
      if (existing) return existing;
      if (inflight.size > 0) {
        return Promise.reject(
          new SkinPackError('busy', `另一资源包下载中: ${[...inflight.keys()].join(',')}`),
        );
      }
      setStatus(slug, { phase: 'downloading', assetsDone: 0, assetsTotal: 0, ratio: 0 });
      telemetry.track('skin_pack_download_started', { slug });
      const startedAt = now();
      let assetsTotal = 0;
      const promise = deps
        .downloadPack(slug, {
          onProgress: (progress) => {
            assetsTotal = progress.assetsTotal;
            setStatus(slug, {
              phase: 'downloading',
              assetsDone: progress.assetsDone,
              assetsTotal: progress.assetsTotal,
              ratio: progress.ratio,
            });
          },
        })
        .then((manifest) => {
          inflight.delete(slug);
          deps.onPackReady(manifest);
          // 注册表成员资格=已物化真源；状态复位 idle（置终态立即通知）
          statuses.delete(slug);
          notifyNow();
          telemetry.track('skin_pack_download_completed', {
            slug,
            duration_ms: now() - startedAt,
            assets: assetsTotal,
          });
          return manifest;
        })
        .catch((error: unknown) => {
          inflight.delete(slug);
          const kind = error instanceof SkinPackError ? error.kind : classify(error);
          if (kind !== 'busy') {
            setStatus(slug, {
              phase: 'failed',
              assetsDone: 0,
              assetsTotal: 0,
              ratio: 0,
              errorKind: kind,
            });
            notifyNow();
            telemetry.track('skin_pack_download_failed', { slug, stage: kind });
          }
          throw error instanceof SkinPackError
            ? error
            : new SkinPackError(kind, error instanceof Error ? error.message : String(error));
        });
      inflight.set(slug, promise);
      return promise;
    },
  };
}
