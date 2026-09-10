import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSkinPackController,
  SkinPackError,
  type SkinPackControllerDeps,
} from './skinPackController';
import type { PackProgress } from '../data/remoteSkinsRepository';
import type { SkinManifest } from '../domain/types';

/**
 * 资源包下载状态机测试（纯 node）：in-flight 去重、busy 互斥、稳定引用、
 * 80ms 节流通知（fake timers）、onPackReady 先于 resolve、错误分类与遥测。
 */

const trackMock = vi.hoisted(() => vi.fn());
vi.mock('../../../telemetry/Telemetry', () => ({ telemetry: { track: trackMock } }));

const manifest = (slug: string): SkinManifest => ({
  id: `${slug}-v1`,
  slug,
  name: slug,
  accessType: 'free',
  manifestVersion: 1,
  defaultState: 'ready',
  states: [
    {
      state: 'ready',
      poster: { uri: `file:///docs/skins/${slug}/v1/ready.png` },
      focalPointX: 0.5,
      focalPointY: 0.5,
      durationMs: 4000,
    },
  ],
  eventMappings: [],
  themeTokens: { accent: '#ABCDEF', surface: '#123456' },
});

/** 可手动放行/失败的单包下载桩 */
function deferredDownloadPack(options: {
  failWith?: (slug: string) => unknown;
  onProgress?: (slug: string) => void;
} = {}) {
  const calls: string[] = [];
  const pending = new Map<string, () => void>();
  let readyAt: SkinManifest | null = null;
  const downloadPack = (slug: string, sink?: { onProgress?: (p: PackProgress) => void }) =>
    new Promise<SkinManifest>((resolve, reject) => {
      calls.push(slug);
      pending.set(slug, () => {
        const failure = options.failWith?.(slug);
        if (failure !== undefined) {
          reject(failure);
          return;
        }
        const result = manifest(slug);
        readyAt = result;
        resolve(result);
      });
      options.onProgress?.(slug);
      sink?.onProgress?.({
        slug,
        assetsDone: 1,
        assetsTotal: 2,
        bytesWritten: 10,
        totalBytes: 20,
        ratio: 0.5,
      });
    });
  return {
    downloadPack,
    calls,
    release: (slug: string) => {
      pending.get(slug)?.();
    },
    /** onPackReady 是否先于 resolve：release 后立即读取 */
    readySnapshot: () => readyAt,
  };
}

function deps(
  harness: ReturnType<typeof deferredDownloadPack>,
  overrides: Partial<SkinPackControllerDeps> = {},
): SkinPackControllerDeps {
  return {
    downloadPack: harness.downloadPack,
    onPackReady: () => undefined,
    now: () => 1_000,
    ...overrides,
  };
}

beforeEach(() => {
  trackMock.mockClear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createSkinPackController', () => {
  it('同 slug 并发共享同一 in-flight（仓储只调一次），两处拿到同一 manifest', async () => {
    const harness = deferredDownloadPack();
    const controller = createSkinPackController(deps(harness));
    const first = controller.downloadPack('alpha');
    const second = controller.downloadPack('alpha');
    expect(harness.calls).toEqual(['alpha']);
    expect(controller.statusFor('alpha').phase).toBe('downloading');
    harness.release('alpha');
    const [a, b] = await Promise.all([first, second]);
    expect(a.slug).toBe('alpha');
    expect(b).toBe(a);
  });

  it('不同 slug 下载中互斥：busy 拒绝且不留 failed 状态', async () => {
    const harness = deferredDownloadPack();
    const controller = createSkinPackController(deps(harness));
    const main = controller.downloadPack('alpha');
    await expect(controller.downloadPack('beta')).rejects.toMatchObject({ kind: 'busy' });
    expect(controller.statusFor('beta').phase).toBe('idle');
    // busy 不打失败遥测（非真实下载失败）
    harness.release('alpha');
    await main;
    expect(trackMock).toHaveBeenCalledWith('skin_pack_download_completed', expect.objectContaining({ slug: 'alpha' }));
    expect(trackMock).not.toHaveBeenCalledWith('skin_pack_download_failed', expect.anything());
  });

  it('成功：onPackReady 先于 resolve；状态复位 idle（注册表=已物化真源）', async () => {
    const harness = deferredDownloadPack();
    const readyOrder: string[] = [];
    const controller = createSkinPackController(deps(harness, {
      onPackReady: (m) => readyOrder.push(`ready:${m.slug}`),
    }));
    const promise = controller.downloadPack('alpha').then((m) => {
      readyOrder.push(`resolved:${m.slug}`);
      return m;
    });
    vi.runOnlyPendingTimers(); // 冲掉进度节流挂起的通知
    harness.release('alpha');
    await promise;
    expect(readyOrder).toEqual(['ready:alpha', 'resolved:alpha']);
    expect(controller.statusFor('alpha').phase).toBe('idle');
    expect(trackMock).toHaveBeenCalledWith('skin_pack_download_started', { slug: 'alpha' });
    expect(trackMock).toHaveBeenCalledWith('skin_pack_download_completed', {
      slug: 'alpha',
      duration_ms: 0,
      assets: 2,
    });
  });

  it.each([
    ['403 权益门禁 → gated', { status: 403 } as unknown, 'gated'],
    ['401 未登录 → gated', { status: 401 } as unknown, 'gated'],
    ['断网（status 0）→ network', { status: 0, code: 'SERVICE_UNAVAILABLE' } as unknown, 'network'],
    ['清单物化失败 → manifest', new Error('清单物化失败: x'), 'manifest'],
  ])('%s', async (_name, failure, expectedKind) => {
    const harness = deferredDownloadPack({ failWith: () => failure });
    const controller = createSkinPackController(deps(harness));
    const promise = controller.downloadPack('alpha');
    harness.release('alpha');
    const error = await promise.then(() => null, (reason: unknown) => reason);
    expect(error).toBeInstanceOf(SkinPackError);
    expect((error as SkinPackError).kind).toBe(expectedKind);
    expect(controller.statusFor('alpha')).toMatchObject({ phase: 'failed', errorKind: expectedKind });
    expect(trackMock).toHaveBeenCalledWith('skin_pack_download_failed', {
      slug: 'alpha',
      stage: expectedKind,
    });
  });

  it('进度通知 80ms 节流；终态立即通知（不待定时器）', async () => {
    const harness = deferredDownloadPack();
    const notifications: number[] = [];
    const controller = createSkinPackController(deps(harness));
    controller.subscribe(() => notifications.push(notifications.length));
    const promise = controller.downloadPack('alpha');
    // 起始 setStatus 排入节流窗口；进度 setStatus 仍在窗口内 → 不新增通知
    expect(notifications.length).toBe(0);
    vi.advanceTimersByTime(80);
    const afterThrottle = notifications.length;
    expect(afterThrottle).toBeGreaterThan(0);
    // 终态：release 后不等 80ms 即通知
    harness.release('alpha');
    await promise;
    expect(notifications.length).toBe(afterThrottle + 1);
  });

  it('statusFor 引用稳定：无更新的轮询读拿到同一快照', async () => {
    const harness = deferredDownloadPack();
    const controller = createSkinPackController(deps(harness));
    expect(controller.statusFor('alpha')).toBe(controller.statusFor('alpha'));
    const promise = controller.downloadPack('alpha');
    vi.runOnlyPendingTimers();
    const downloading = controller.statusFor('alpha');
    expect(controller.statusFor('alpha')).toBe(downloading);
    harness.release('alpha');
    await promise;
    expect(controller.statusFor('alpha')).not.toBe(downloading);
  });
});
