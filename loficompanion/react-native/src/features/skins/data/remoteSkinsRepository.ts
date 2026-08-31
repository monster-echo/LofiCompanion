import { File, Directory, Paths } from 'expo-file-system';
import { apiClient, resolveAssetUrl } from '../../../data/apiClient';
import { materializeManifest } from '../domain/remoteSkinMaterialize';
import type { SkinSummaryRemote } from '../../../data/apiClient';
import type { CompanionState, SkinManifest, SkinStateAsset } from '../domain/types';

/**
 * 远端皮肤仓储（P0-B 免审核发新皮肤）：
 *  1. GET /v1/skins 拉目录 → 2. 按（版本号）缓存目录拉 manifest（免费公开、
 *  付费走服务端权益门禁，401/403 静默跳过）→ 3. 全部状态海报落盘后才产出
 *  manifest（绝不半套渲染：stateAsset 的回退是清单内状态级，不是资产级）。
 *
 * 缓存：documentDirectory/skins/<slug>/v<version>/<state>.png，新版本落盘成功
 * 后清旧版本目录；resolveInjectable 便于 vitest 注入桩。
 */

const CACHE_ROOT = 'skins';
/** 远端皮肤 LRU 上限：超出时最旧的 slug 目录被清理 */
const MAX_CACHED_SKINS = 6;

export interface RemoteSkinsDeps {
  /** 缺省走 apiClient.skins / apiClient.skinManifest（测试注入桩） */
  fetchCatalog?: () => Promise<readonly SkinSummaryRemote[]>;
  fetchManifest?: (skinIdOrSlug: string) => Promise<Record<string, unknown>>;
  /** 海报 objectKey → 可下载 URL（缺省 resolveAssetUrl；测试注入） */
  resolvePosterUrl?: (objectKey: string) => Promise<string | null>;
  /** 落盘下载（缺省 File.downloadFileAsync；测试注入内存盘） */
  download?: (url: string, targetUri: string) => Promise<void>;
}

function defaultDeps(): Required<RemoteSkinsDeps> {
  return {
    fetchCatalog: async () => (await apiClient.skins()).skins,
    fetchManifest: async (key) => (await apiClient.skinManifest(key)).manifest,
    resolvePosterUrl: (objectKey) => resolveAssetUrl(objectKey),
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

/**
 * 拉取并物化全部可用的远端皮肤。任一皮肤失败（未登录 401 / 无权益 403 /
 * 海报下载失败）只影响它自己——其余皮肤照常返回。
 */
export async function fetchRemoteSkins(
  injectableDeps: RemoteSkinsDeps = {},
): Promise<readonly SkinManifest[]> {
  const deps = { ...defaultDeps(), ...injectableDeps };
  let catalog: readonly SkinSummaryRemote[];
  try {
    catalog = await deps.fetchCatalog();
  } catch {
    return [];
  }
  const results: SkinManifest[] = [];
  for (const summary of catalog) {
    try {
      const raw = await deps.fetchManifest(summary.slug);
      const materialized = materializeManifest(raw, stateFileUri);
      if (!materialized) continue;
      const { manifest, posterKeys } = materialized;

      // 海报齐套才产出：缺任一状态都放弃该皮肤（不做半套渲染）
      const missing: Array<{ state: SkinStateAsset; url: string }> = [];
      let allCached = true;
      for (const asset of manifest.states) {
        const fileUri = (asset.poster as { readonly uri: string }).uri;
        const file = new File(fileUri);
        if (file.exists && file.size > 0) continue;
        allCached = false;
        const objectKey = posterKeys[asset.state] ?? '';
        const url = objectKey ? await deps.resolvePosterUrl(objectKey) : null;
        if (!url) throw new Error(`海报地址解析失败: ${asset.state}`);
        missing.push({ state: asset, url });
      }
      if (!allCached) {
        ensureDir(manifest.slug, manifest.manifestVersion);
        for (const item of missing) {
          await deps.download(item.url, (item.state.poster as { readonly uri: string }).uri);
        }
      }
      await pruneCache(manifest.slug, manifest.manifestVersion);
      results.push(manifest);
    } catch {
      // 单皮肤失败静默跳过（目录下一轮 refresh 重试）
    }
  }
  return results;
}
