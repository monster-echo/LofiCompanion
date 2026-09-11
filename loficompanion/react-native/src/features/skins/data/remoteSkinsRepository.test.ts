import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

/**
 * 远端皮肤仓储（资源包模型）测试：vi.mock expo-file-system 为内存盘（工厂
 * mock 不加载真模块——vitest node env 无 RN 桥）。apiClient/telemetry 同样
 * 工厂 mock，聚焦仓储自身的编排逻辑：水合绝不下载、齐套才收录、磁盘回退、
 * `.part` 纪律、进度聚合、全有或全无。
 */

const fs = vi.hoisted(() => {
  const files = new Map<string, { size: number; text: string }>();
  const dirs = new Set<string>();

  const join = (...parts: Array<string | { uri: string }>): string => {
    let path = '';
    for (const part of parts) {
      const piece = typeof part === 'string' ? part : part.uri;
      path = path === '' || path.endsWith('/') ? path + piece : `${path}/${piece}`;
    }
    return path;
  };

  class File {
    uri: string;
    constructor(...uris: Array<string | File | Directory>) {
      this.uri = join(...uris);
    }
    /** 真 expo File 有 name（clearPartFiles/list 消费者依赖） */
    get name(): string {
      return this.uri.slice(this.uri.lastIndexOf('/') + 1);
    }
    get exists(): boolean {
      return files.has(this.uri);
    }
    get size(): number {
      return files.get(this.uri)?.size ?? 0;
    }
    create(): void {
      if (!files.has(this.uri)) files.set(this.uri, { size: 0, text: '' });
    }
    write(text: string): void {
      files.set(this.uri, { size: text.length, text });
    }
    async text(): Promise<string> {
      return files.get(this.uri)?.text ?? '';
    }
    rename(newName: string): void {
      const data = files.get(this.uri);
      if (data === undefined) throw new Error(`rename 缺失文件: ${this.uri}`);
      files.delete(this.uri);
      files.set(join(this.uri.slice(0, this.uri.lastIndexOf('/')), newName), data);
    }
    delete(): void {
      files.delete(this.uri);
    }
  }

  class Directory {
    uri: string;
    constructor(...uris: Array<string | File | Directory>) {
      this.uri = join(...uris);
    }
    get name(): string {
      return this.uri.slice(this.uri.lastIndexOf('/') + 1);
    }
    get exists(): boolean {
      if (dirs.has(this.uri)) return true;
      const prefix = `${this.uri}/`;
      for (const key of files.keys()) {
        if (key.startsWith(prefix)) return true;
      }
      return false;
    }
    create(): void {
      dirs.add(this.uri);
    }
    list(): Array<File | Directory> {
      const prefix = `${this.uri}/`;
      const names = new Map<string, 'file' | 'dir'>();
      for (const key of files.keys()) {
        if (!key.startsWith(prefix)) continue;
        const segments = key.slice(prefix.length).split('/');
        names.set(segments[0], segments.length > 1 ? 'dir' : 'file');
      }
      for (const dir of dirs) {
        if (!dir.startsWith(prefix)) continue;
        const head = dir.slice(prefix.length).split('/')[0];
        if (head) names.set(head, 'dir');
      }
      return [...names.entries()].map(([name, kind]) =>
        kind === 'dir' ? new Directory(this.uri, name) : new File(this.uri, name),
      );
    }
    delete(): void {
      const prefix = `${this.uri}/`;
      for (const key of [...files.keys()]) {
        if (key.startsWith(prefix)) files.delete(key);
      }
      for (const dir of [...dirs]) {
        if (dir === this.uri || dir.startsWith(prefix)) dirs.delete(dir);
      }
    }
  }

  const Paths = { document: { uri: 'file:///docs' } };
  return { File, Directory, Paths, files };
});

vi.mock('expo-file-system', () => ({
  File: fs.File,
  Directory: fs.Directory,
  Paths: fs.Paths,
}));

const trackMock = vi.hoisted(() => vi.fn());
vi.mock('../../../telemetry/Telemetry', () => ({ telemetry: { track: trackMock } }));

// 仓储只在缺省 deps 时触达 apiClient；测试一律注入桩，工厂 mock 防真模块加载
vi.mock('../../../data/apiClient', () => ({
  apiClient: { skins: vi.fn(), skinManifest: vi.fn() },
  skinStatePosterUrl: vi.fn(),
  skinStateVideoUrl: vi.fn(),
}));

import {
  downloadSkinPack,
  hydrateRemoteSkins,
  type PackProgress,
  type RemoteSkinsDeps,
} from './remoteSkinsRepository';
import type { SkinSummaryRemote } from '../../../data/apiClient';

const DOC = 'file:///docs';

const summary = (slug: string): SkinSummaryRemote => ({
  id: `skin-${slug}`,
  slug,
  name: slug,
  accessType: 'free',
  manifestVersion: 1,
  moderationStatus: 'approved',
  publishedAt: null,
  posterUrl: null,
});

const rawManifest = (slug: string, version = 1) => ({
  slug,
  manifestVersion: version,
  defaultState: 'ready',
  themeTokens: { accent: '#ABCDEF', surface: '#123456' },
  states: [
    {
      state: 'ready',
      posterUrl: `loficompanion/production/skins/${slug}/ready.png`,
      videoUrl: `loficompanion/production/skins/${slug}/videos/ready.mp4`,
      focalPointX: 0.5,
      focalPointY: 0.5,
      durationMs: 4000,
    },
    {
      state: 'focusing',
      posterUrl: `loficompanion/production/skins/${slug}/focusing.png`,
      focalPointX: 0.5,
      focalPointY: 0.5,
      durationMs: 4000,
    },
  ],
});

/** 缓存目录内的全图资产（不含缩略图/manifest.json） */
function seedPack(slug: string, version = 1): void {
  for (const file of [`v${version}/ready.png`, `v${version}/ready.mp4`, `v${version}/focusing.png`]) {
    fs.files.set(`${DOC}/skins/${slug}/${file}`, { size: 10, text: 'asset' });
  }
}

function seedManifestJson(slug: string, version = 1): void {
  fs.files.set(`${DOC}/skins/${slug}/v${version}/manifest.json`, {
    size: 1,
    text: JSON.stringify(rawManifest(slug, version)),
  });
}

interface DepsHarness {
  deps: RemoteSkinsDeps;
  downloadedUris: Mock;
}

/** download 桩：记录目标 uri，可选按「完整 url」配置失败 */
function depsWith(options: {
  catalog?: readonly SkinSummaryRemote[];
  manifestFor?: (slug: string) => Promise<Record<string, unknown>>;
  failUrls?: ReadonlySet<string>;
} = {}): DepsHarness {
  const downloadedUris = vi.fn();
  return {
    downloadedUris,
    deps: {
      fetchCatalog: async () => options.catalog ?? [],
      fetchManifest: async (slug: string) => {
        if (options.manifestFor) return options.manifestFor(slug);
        return rawManifest(slug);
      },
      resolvePublicUrls: (slug: string, state: string) => ({
        poster: `https://cdn.example/${slug}/${state}.png`,
        thumb: `https://cdn.example/${slug}/${state}.thumb.jpg`,
        video: `https://cdn.example/${slug}/videos/${state}.mp4`,
      }),
      download: async (
        url: string,
        targetUri: string,
        onProgress?: (bytesWritten: number, totalBytes: number) => void,
      ) => {
        downloadedUris(targetUri);
        if (options.failUrls?.has(url)) throw new Error(`下载失败: ${url}`);
        onProgress?.(10, 10);
        fs.files.set(targetUri, { size: 10, text: 'asset' });
      },
    },
  };
}

beforeEach(() => {
  fs.files.clear();
  trackMock.mockClear();
});

describe('hydrateRemoteSkins（启动水合）', () => {
  it('绝不下载；资产不齐套的皮肤不收录', async () => {
    seedPack('alpha'); // 齐套
    const { deps, downloadedUris } = depsWith({
      catalog: [summary('alpha'), summary('beta')],
    });
    const result = await hydrateRemoteSkins(deps);
    expect(downloadedUris).not.toHaveBeenCalled();
    // alpha 齐套收录；beta 无磁盘资产被排除
    expect(result.map((skin) => skin.slug)).toEqual(['alpha']);
  });

  it('齐套包收录为本地 uri 形态；无缩略图时不带 cardPoster', async () => {
    seedPack('alpha');
    seedManifestJson('alpha');
    const { deps } = depsWith({ catalog: [summary('alpha')] });
    const [skin] = await hydrateRemoteSkins(deps);
    expect(skin).toBeTruthy();
    expect(skin?.manifestVersion).toBe(1);
    expect(skin?.states[0]?.poster).toEqual({ uri: `${DOC}/skins/alpha/v1/ready.png` });
    expect(skin?.states[0]?.loopVideo).toEqual({ uri: `${DOC}/skins/alpha/v1/ready.mp4` });
    expect(skin?.states[0]?.cardPoster).toBeUndefined();
  });

  it('目录拉取失败回退磁盘缓存（离线可用已获包）', async () => {
    seedPack('alpha');
    seedManifestJson('alpha');
    const { deps } = depsWith({ catalog: [summary('alpha')] });
    const failing = { ...deps, fetchCatalog: async (): Promise<never> => {
      throw new Error('offline');
    } };
    const result = await hydrateRemoteSkins(failing);
    expect(result.map((skin) => skin.slug)).toEqual(['alpha']);
    expect(trackMock).toHaveBeenCalledWith('skin_catalog_fetch_failed');
  });

  it('清单 403（门禁）+ 磁盘齐套仍收录；403 不打 skin_fetch_failed', async () => {
    seedPack('alpha');
    seedManifestJson('alpha');
    const { deps } = depsWith({
      catalog: [summary('alpha')],
      manifestFor: async () => {
        const error = new Error('尚未获得皮肤权益') as Error & { status?: number };
        error.status = 403;
        throw error;
      },
    });
    const result = await hydrateRemoteSkins(deps);
    expect(result.map((skin) => skin.slug)).toEqual(['alpha']);
    expect(trackMock).not.toHaveBeenCalledWith('skin_fetch_failed', expect.anything());
  });

  it('服务端 bump 版本后回退磁盘齐套旧版本（已获包不失联）', async () => {
    seedPack('alpha', 1);
    seedManifestJson('alpha', 1);
    const { deps } = depsWith({
      catalog: [summary('alpha')],
      manifestFor: async () => rawManifest('alpha', 2), // v2 资产不在盘
    });
    const [skin] = await hydrateRemoteSkins(deps);
    expect(skin?.manifestVersion).toBe(1);
  });

  it('非门禁错误打 skin_fetch_failed；无磁盘回退时排除该皮肤', async () => {
    const { deps } = depsWith({
      catalog: [summary('alpha')],
      manifestFor: async () => {
        throw new Error('boom');
      },
    });
    const result = await hydrateRemoteSkins(deps);
    expect(result).toEqual([]);
    expect(trackMock).toHaveBeenCalledWith('skin_fetch_failed', expect.objectContaining({ slug: 'alpha' }));
  });
});

describe('downloadSkinPack（单包按需下载）', () => {
  it('只下缺失资产；成功后 manifest 持久化', async () => {
    fs.files.set(`${DOC}/skins/alpha/v1/ready.png`, { size: 10, text: 'asset' }); // 已在盘
    const { deps, downloadedUris } = depsWith({ catalog: [summary('alpha')] });
    const manifest = await downloadSkinPack('alpha', {}, deps);
    // 全图缺 ready.mp4 与 focusing.png；缩略图两张是 best-effort 附加批量
    expect(downloadedUris.mock.calls.map((call) => call[0]).sort()).toEqual([
      `${DOC}/skins/alpha/v1/focusing.png.part`,
      `${DOC}/skins/alpha/v1/focusing.thumb.jpg.part`,
      `${DOC}/skins/alpha/v1/ready.mp4.part`,
      `${DOC}/skins/alpha/v1/ready.thumb.jpg.part`,
    ]);
    // .part rename 就位，最终文件在盘
    expect(fs.files.has(`${DOC}/skins/alpha/v1/ready.mp4`)).toBe(true);
    expect(fs.files.has(`${DOC}/skins/alpha/v1/focusing.png`)).toBe(true);
    expect(fs.files.has(`${DOC}/skins/alpha/v1/ready.mp4.part`)).toBe(false);
    // manifest.json 持久化（离线回退数据源）
    expect(fs.files.has(`${DOC}/skins/alpha/v1/manifest.json`)).toBe(true);
    expect(manifest.states).toHaveLength(2);
  });

  it('进度聚合：首事件从 0 起，完成 ratio=1、assetsDone=assetsTotal', async () => {
    const progress: PackProgress[] = [];
    const { deps } = depsWith();
    await downloadSkinPack('alpha', { onProgress: (p) => progress.push(p) }, deps);
    // 3 资产（ready 海报+视频、focusing 海报）
    expect(progress[0]).toMatchObject({ assetsDone: 0, assetsTotal: 3, ratio: 0 });
    expect(progress.at(-1)).toMatchObject({ assetsDone: 3, assetsTotal: 3, ratio: 1 });
    // 各资产报 10/10 → 聚合总长已知（30），byteRatio 分支生效
    expect(progress.some((p) => p.totalBytes === 30)).toBe(true);
  });

  it('进度聚合：字节比只覆盖缺失段（25+50+25 / 50+100+50 → 0.5）', async () => {
    const resolves: Array<() => void> = [];
    const progress: PackProgress[] = [];
    const deps: RemoteSkinsDeps = {
      fetchManifest: async () => rawManifest('alpha'),
      resolvePublicUrls: (slug: string, state: string) => ({
        poster: `https://cdn.example/${slug}/${state}.png`,
        thumb: `https://cdn.example/${slug}/${state}.thumb.jpg`,
        video: `https://cdn.example/${slug}/videos/${state}.mp4`,
      }),
      download: (url, targetUri, onProgress) => {
        // 缩略图批量立即完成：只把三个全图资产挂起，mid 断言后手动放行
        if (url.includes('.thumb.jpg')) {
          fs.files.set(targetUri, { size: 5, text: 'thumb' });
          return Promise.resolve();
        }
        return new Promise<void>((resolve) => {
          // ready.mp4 报 50/100，其余各报 25/50 → 已知总长 200，已写 100
          const full = url.endsWith('ready.mp4') ? [50, 100] : [25, 50];
          resolves.push(() => {
            onProgress?.(full[1], full[1]); // 完成 = 写满（真实下载的终态进度）
            resolve();
          });
          onProgress?.(full[0], full[1]);
          fs.files.set(targetUri, { size: 10, text: 'asset' });
        });
      },
    };
    const done = downloadSkinPack('alpha', { onProgress: (p) => progress.push(p) }, deps);
    // 宏任务边界：等清单拉取+换签微任务链落地，三个并行下载同步体已发出进度
    await new Promise((resolve) => setTimeout(resolve, 0));
    const mid = progress.at(-1);
    expect(mid).toMatchObject({ assetsDone: 0, assetsTotal: 3, bytesWritten: 100, totalBytes: 200 });
    expect(Math.abs((mid?.ratio ?? 0) - 0.5)).toBeLessThan(1e-9);
    for (const resolve of resolves) resolve();
    await done;
    expect(progress.at(-1)).toMatchObject({ ratio: 1 });
  });

  it('任一资产失败即放弃：不产出清单（无 manifest.json）、.part 清理；已完成的合法资产保留', async () => {
    const { deps } = depsWith({
      catalog: [summary('alpha')],
      failUrls: new Set(['https://cdn.example/alpha/focusing.png']),
    });
    await expect(downloadSkinPack('alpha', {}, deps)).rejects.toThrow('下载失败');
    expect(fs.files.has(`${DOC}/skins/alpha/v1/manifest.json`)).toBe(false);
    expect([...fs.files.keys()].filter((key) => key.endsWith('.part'))).toEqual([]);
    // 失败前已完整落盘的资产保留（重试按 fileReady 跳过，只补缺）
    expect(fs.files.has(`${DOC}/skins/alpha/v1/ready.png`)).toBe(true);
  });

  it('清单 401/403 原样上抛（gated 判定），不触碰下载', async () => {
    const { deps, downloadedUris } = depsWith({
      catalog: [summary('alpha')],
      manifestFor: async () => {
        const error = new Error('请先登录') as Error & { status?: number };
        error.status = 401;
        throw error;
      },
    });
    await expect(downloadSkinPack('alpha', {}, deps)).rejects.toMatchObject({ status: 401 });
    expect(downloadedUris).not.toHaveBeenCalled();
  });

  it('上次中断的 .part 残留在下次尝试开始时清理', async () => {
    fs.files.set(`${DOC}/skins/alpha/v1/ready.mp4.part`, { size: 5, text: 'stale' });
    const { deps } = depsWith();
    await downloadSkinPack('alpha', {}, deps);
    expect(fs.files.has(`${DOC}/skins/alpha/v1/ready.mp4.part`)).toBe(false);
    expect(fs.files.has(`${DOC}/skins/alpha/v1/ready.mp4`)).toBe(true);
  });

  it('缩略图 best-effort：失败不放弃包，卡片回落全图', async () => {
    const { deps } = depsWith({
      catalog: [summary('alpha')],
      failUrls: new Set(['https://cdn.example/alpha/ready.thumb.jpg']),
    });
    const manifest = await downloadSkinPack('alpha', {}, deps);
    expect(manifest.states[0]?.cardPoster).toBeUndefined();
    expect(fs.files.has(`${DOC}/skins/alpha/v1/ready.png`)).toBe(true);
    expect(fs.files.has(`${DOC}/skins/alpha/v1/ready.thumb.jpg`)).toBe(false);
  });

  it('缩略图成功时补 cardPoster（thumb key 与服务端同约派生）', async () => {
    const { deps } = depsWith();
    const manifest = await downloadSkinPack('alpha', {}, deps);
    expect(manifest.states[0]?.cardPoster).toEqual({ uri: `${DOC}/skins/alpha/v1/ready.thumb.jpg` });
  });
});
