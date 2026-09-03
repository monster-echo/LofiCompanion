import { File, Directory, Paths } from 'expo-file-system';
import { apiClient, resolveAssetUrl } from '../../../data/apiClient';
import { materializeManifest } from '../domain/remoteSkinMaterialize';
import type { SkinSummaryRemote } from '../../../data/apiClient';
import type { SkinManifest } from '../domain/types';

/**
 * 远端皮肤仓储（P0-B 免审核发新皮肤 → P2 皮肤云端化主通道）：
 *  1. GET /v1/skins 拉目录 → 2. 按（版本号）缓存拉 manifest（免费公开、付费走
 *  服务端权益门禁，401/403 静默跳过）→ 3. 全部状态海报+视频落盘后才产出
 *  manifest（绝不半套渲染）→ 4. 原始 manifest JSON 持久化到版本目录。
 *
 * 离线语义（pull 到本地后离线只能用本地的）：目录拉取失败时回退磁盘缓存——
 * 扫描 skins/<slug>/v<version>/manifest.json，用已缓存资产拼装清单；仅全新
 * 安装且从未成功联网过才是空清单。
 *
 * 缓存：documentDirectory/skins/<slug>/v<version>/{<state>.png,<state>.mp4,
 * manifest.json}，新版本落盘成功后清旧版本目录；resolveInjectable 便于 vitest
 * 注入桩。
 */

const CACHE_ROOT = 'skins';
/** 远端皮肤 LRU 上限：超出时最旧的 slug 目录被清理 */
const MAX_CACHED_SKINS = 6;

export interface RemoteSkinsDeps {
  /** 缺省走 apiClient.skins / apiClient.skinManifest（测试注入桩） */
  fetchCatalog?: () => Promise<readonly SkinSummaryRemote[]>;
  fetchManifest?: (skinIdOrSlug: string) => Promise<Record<string, unknown>>;
  /** 资产 objectKey → 可下载 URL（缺省 resolveAssetUrl；测试注入） */
  resolveAssetUrl?: (objectKey: string) => Promise<string | null>;
  /** 落盘下载（缺省 File.downloadFileAsync；测试注入内存盘） */
  download?: (url: string, targetUri: string) => Promise<void>;
}

function defaultDeps(): Required<RemoteSkinsDeps> {
  return {
    fetchCatalog: async () => (await apiClient.skins()).skins,
    fetchManifest: async (key) => (await apiClient.skinManifest(key)).manifest,
    resolveAssetUrl: (objectKey) => resolveAssetUrl(objectKey),
    download: async (url, targetUri) => {
      await File.downloadFileAsync(url, new File(targetUri));
    },
  };
}

function skinDir(slug: string, version: number): Directory {
  return new Directory(Paths.document, CACHE_ROOT, slug, `v${version}`);
}

function stateFileUri(slug: string, version: number, state: string): string {
  return `${skinDir(slug, version).uri}/${state}.png`;
}

function videoFileUri(slug: string, version: number, state: string): string {
  return `${skinDir(slug, version).uri}/${state}.mp4`;
}

/** 逐级建目录（create 无 intermediates 选项；exists 先查保证幂等） */
function ensureDir(slug: string, version: number): Directory {
  const root = new Directory(Paths.document, CACHE_ROOT);
  try {
    if (!root.exists) root.create();
  } catch {
    // 已存在（并发）：忽略
  }
  const slugDir = new Directory(root, slug);
  try {
    if (!slugDir.exists) slugDir.create();
  } catch {
    // 已存在：忽略
  }
  const versionDir = new Directory(slugDir, `v${version}`);
  try {
    if (!versionDir.exists) versionDir.create();
  } catch {
    // 已存在：忽略
  }
  return versionDir;
}

/** 安全删除（目录缺失/占用时静默） */
function deleteDir(dir: Directory): void {
  try {
    if (dir.exists) dir.delete();
  } catch {
    // 忽略
  }
}

/** 版本失效：仅保留 maxVersion；再按 LRU 上限裁最旧 slug */
async function pruneCache(slug: string, maxVersion: number): Promise<void> {
  const root = new Directory(Paths.document, CACHE_ROOT, slug);
  if (root.exists) {
    for (const entry of root.list()) {
      if (entry instanceof Directory && entry.name !== `v${maxVersion}`) {
        deleteDir(entry);
      }
    }
  }
  const cacheRoot = new Directory(Paths.document, CACHE_ROOT);
  if (cacheRoot.exists) {
    const slugs = cacheRoot.list().filter((entry) => entry instanceof Directory);
    // 简易 LRU：目录修改序未知时按 slug 名排序裁剪（P0 接受的近似）
    if (slugs.length > MAX_CACHED_SKINS) {
      const excess = slugs
        .map((entry) => entry as Directory)
        .filter((dir) => dir.name !== slug)
        .slice(0, slugs.length - MAX_CACHED_SKINS);
      for (const dir of excess) deleteDir(dir);
    }
  }
}

/** 缓存文件就绪判定（存在且非空——半截下载视同缺失，下轮重下） */
function fileReady(uri: string): boolean {
  const file = new File(uri);
  return file.exists && file.size > 0;
}

/** manifest JSON 持久化（离线回退的数据源；失败静默——下轮 refresh 重试） */
function persistManifest(slug: string, version: number, raw: Record<string, unknown>): void {
  try {
    const file = new File(skinDir(slug, version), 'manifest.json');
    if (!file.exists) file.create();
    file.write(JSON.stringify(raw));
  } catch {
    // 忽略
  }
}

/** 清单资产是否已全部在盘（海报+视频齐套才可离线产出） */
function cachedComplete(manifest: SkinManifest): boolean {
  return manifest.states.every((asset) => {
    if (!fileReady((asset.poster as { readonly uri: string }).uri)) return false;
    if (asset.loopVideo && !fileReady((asset.loopVideo as { readonly uri: string }).uri)) {
      return false;
    }
    return true;
  });
}

/** 离线回退：扫描磁盘缓存，按 slug 取「有 manifest.json 的最高版本」拼装清单 */
async function readCachedSkins(): Promise<readonly SkinManifest[]> {
  const root = new Directory(Paths.document, CACHE_ROOT);
  if (!root.exists) return [];
  const results: SkinManifest[] = [];
  for (const entry of root.list()) {
    if (!(entry instanceof Directory)) continue;
    const slugDir = entry;
    const versions = slugDir
      .list()
      .filter((child): child is Directory => child instanceof Directory && /^v\d+$/.test(child.name))
      .map((dir) => Number.parseInt(dir.name.slice(1), 10))
      .filter((version) => Number.isFinite(version))
      .sort((a, b) => b - a);
    for (const version of versions) {
      try {
        const manifestFile = new File(skinDir(slugDir.name, version), 'manifest.json');
        if (!manifestFile.exists) continue;
        const raw = JSON.parse(await manifestFile.text()) as Record<string, unknown>;
        const materialized = materializeManifest(raw, stateFileUri, videoFileUri);
        if (!materialized || !cachedComplete(materialized.manifest)) continue;
        results.push(materialized.manifest);
        break; // 最高可用版本即可
      } catch {
        // 损坏版本跳过，尝试更低版本
      }
    }
  }
  return results;
}

interface PendingDownload {
  uri: string;
  url: string;
}

/**
 * 拉取并物化全部可用的远端皮肤。任一皮肤失败（未登录 401 / 无权益 403 /
 * 资产下载失败）只影响它自己——其余皮肤照常返回；目录失败走磁盘缓存回退。
 */
export async function fetchRemoteSkins(
  injectableDeps: RemoteSkinsDeps = {},
): Promise<readonly SkinManifest[]> {
  const deps = { ...defaultDeps(), ...injectableDeps };
  let catalog: readonly SkinSummaryRemote[];
  try {
    catalog = await deps.fetchCatalog();
  } catch {
    // 离线/网络异常：回退本地缓存（pull 到本地的皮肤离线继续可用）
    return readCachedSkins();
  }
  const results: SkinManifest[] = [];
  for (const summary of catalog) {
    try {
      const raw = await deps.fetchManifest(summary.slug);
      const materialized = materializeManifest(raw, stateFileUri, videoFileUri);
      if (!materialized) continue;
      const { manifest, posterKeys, videoKeys } = materialized;

      // 海报+视频齐套才产出：缺任一资产都放弃该皮肤（不做半套渲染）
      const missing: PendingDownload[] = [];
      for (const asset of manifest.states) {
        if (!fileReady((asset.poster as { readonly uri: string }).uri)) {
          const objectKey = posterKeys[asset.state] ?? '';
          const url = objectKey ? await deps.resolveAssetUrl(objectKey) : null;
          if (!url) throw new Error(`海报地址解析失败: ${asset.state}`);
          missing.push({ uri: (asset.poster as { readonly uri: string }).uri, url });
        }
        if (asset.loopVideo && !fileReady((asset.loopVideo as { readonly uri: string }).uri)) {
          const objectKey = videoKeys[asset.state] ?? '';
          const url = objectKey ? await deps.resolveAssetUrl(objectKey) : null;
          if (!url) throw new Error(`视频地址解析失败: ${asset.state}`);
          missing.push({ uri: (asset.loopVideo as { readonly uri: string }).uri, url });
        }
      }
      if (missing.length > 0) {
        ensureDir(manifest.slug, manifest.manifestVersion);
        // 同皮肤内并行下载（6 态 × 2 资产串行太慢）；任一失败即放弃该皮肤
        await Promise.all(missing.map((item) => deps.download(item.url, item.uri)));
      }
      await pruneCache(manifest.slug, manifest.manifestVersion);
      persistManifest(manifest.slug, manifest.manifestVersion, raw);
      results.push(manifest);
    } catch {
      // 单皮肤失败静默跳过（目录下一轮 refresh 重试）
    }
  }
  return results;
}
