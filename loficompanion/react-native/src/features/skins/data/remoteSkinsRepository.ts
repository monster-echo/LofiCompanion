import { File, Directory, Paths } from 'expo-file-system';
import { apiClient, resolveAssetUrl } from '../../../data/apiClient';
import { telemetry } from '../../../telemetry/Telemetry';
import { materializeManifest } from '../domain/remoteSkinMaterialize';
import { deriveThumbKey } from '../domain/thumbKey';
import type { SkinSummaryRemote } from '../../../data/apiClient';
import type { SkinManifest } from '../domain/types';

/**
 * 远端皮肤仓储（P2 皮肤云端化 → 资源包模型）：
 *  - hydrateRemoteSkins：启动水合——只收录「资产已齐套落盘」的包，绝不下载
 *    （目录一大全量预下载不可持续；媒体获取收敛到用户主动的 downloadSkinPack）。
 *    目录失败回退磁盘缓存；单皮肤清单不可达（付费 401/403 门禁、网络抖动、
 *    服务端 bump 版本）时回退该 slug 磁盘上最高且齐套的版本——已获包不失联。
 *  - downloadSkinPack：单包按需下载（全有或全无）——清单 → 缺失资产下载到
 *    `.part` 临时文件、成功后 rename 就位（杜绝半截文件冒充齐套：启动不再
 *    自动重下，坏包会永久占位），全部就位后持久化原始 manifest 并清旧版本。
 *
 * 卡片缩略图（<state>.thumb.jpg，biz 发布管线生成的 960 宽 JPEG）best-effort
 * 附加下载：失败不影响皮肤可用，卡片回落全图 poster；沉浸面/详情永远用全图。
 *
 * 离线语义（pull 到本地后离线只能用本地的）：目录拉取失败时回退磁盘缓存——
 * 仅全新安装且从未成功联网过才是空清单。
 *
 * 缓存：documentDirectory/skins/<slug>/v<version>/{<state>.png,<state>.mp4,
 * <state>.thumb.jpg, manifest.json}，新版本落盘成功后清旧版本目录；deps 可
 * 注入便于 vitest 注入桩。
 */

const CACHE_ROOT = 'skins';
/** 远端皮肤 LRU 上限：超出时最旧的 slug 目录被清理 */
const MAX_CACHED_SKINS = 6;

/** 资源包下载进度（字节比仅统计缺失资产；任一总长未知时 ratio 回退资产计数） */
export interface PackProgress {
  readonly slug: string;
  readonly assetsDone: number;
  readonly assetsTotal: number;
  readonly bytesWritten: number;
  /** 聚合总字节；任一资产总长未知时为 -1 */
  readonly totalBytes: number;
  /** 0..1：字节比可信用字节比，否则用资产计数比 */
  readonly ratio: number;
}

export interface RemoteSkinsDeps {
  /** 缺省走 apiClient.skins / apiClient.skinManifest（测试注入桩） */
  fetchCatalog?: () => Promise<readonly SkinSummaryRemote[]>;
  fetchManifest?: (skinIdOrSlug: string) => Promise<Record<string, unknown>>;
  /** 资产 objectKey → 可下载 URL（缺省 resolveAssetUrl；测试注入） */
  resolveAssetUrl?: (objectKey: string) => Promise<string | null>;
  /** 落盘下载（缺省 File.createDownloadTask 带字节进度；测试注入内存盘） */
  download?: (
    url: string,
    targetUri: string,
    onProgress?: (bytesWritten: number, totalBytes: number) => void,
  ) => Promise<void>;
}

function defaultDeps(): Required<RemoteSkinsDeps> {
  return {
    fetchCatalog: async () => (await apiClient.skins()).skins,
    fetchManifest: async (key) => (await apiClient.skinManifest(key)).manifest,
    resolveAssetUrl: (objectKey) => resolveAssetUrl(objectKey),
    download: async (url, targetUri, onProgress) => {
      await File.createDownloadTask(url, new File(targetUri), {
        onProgress: (data) => onProgress?.(data.bytesWritten, data.totalBytes),
      }).downloadAsync();
    },
  };
}

function skinDir(slug: string, version: number): Directory {
  return new Directory(Paths.document, CACHE_ROOT, slug, `v${version}`);
}

function stateFileUri(slug: string, version: number, state: string): string {
  return `${skinDir(slug, version).uri}/${state}.png`;
}

function stateThumbFileUri(slug: string, version: number, state: string): string {
  return `${skinDir(slug, version).uri}/${state}.thumb.jpg`;
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

/** 缓存文件就绪判定（存在且非空——半截下载视同缺失） */
function fileReady(uri: string): boolean {
  const file = new File(uri);
  return file.exists && file.size > 0;
}

/**
 * 卡片缩略图就位的资产补 cardPoster（本地 <state>.thumb.jpg）。缺文件的
 * 不补——Image 对不存在文件只会加载失败白卡，卡片按 poster 全图渲染。
 * 全图 poster 与视频的齐套判定（cachedComplete）不受缩略图影响。
 */
function withCardPosters(manifest: SkinManifest): SkinManifest {
  return {
    ...manifest,
    states: manifest.states.map((asset) => {
      const thumbUri = stateThumbFileUri(manifest.slug, manifest.manifestVersion, asset.state);
      return fileReady(thumbUri) ? { ...asset, cardPoster: { uri: thumbUri } } : asset;
    }),
  };
}

/** manifest JSON 持久化（离线回退的数据源；失败静默——下次下载重试） */
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

/** 某 slug 磁盘上「有 manifest.json 且资产齐套」的最高版本清单；无则 null */
async function firstCompleteCachedManifest(slug: string): Promise<SkinManifest | null> {
  const slugDir = new Directory(Paths.document, CACHE_ROOT, slug);
  if (!slugDir.exists) return null;
  const versions = slugDir
    .list()
    .filter((child): child is Directory => child instanceof Directory && /^v\d+$/.test(child.name))
    .map((dir) => Number.parseInt(dir.name.slice(1), 10))
    .filter((version) => Number.isFinite(version))
    .sort((a, b) => b - a);
  for (const version of versions) {
    try {
      const manifestFile = new File(skinDir(slug, version), 'manifest.json');
      if (!manifestFile.exists) continue;
      const raw = JSON.parse(await manifestFile.text()) as Record<string, unknown>;
      const materialized = materializeManifest(raw, stateFileUri, videoFileUri);
      if (!materialized || !cachedComplete(materialized.manifest)) continue;
      return withCardPosters(materialized.manifest);
    } catch {
      // 损坏版本跳过，尝试更低版本
    }
  }
  return null;
}

/** 离线回退：扫描磁盘缓存，按 slug 取「最高可用版本」拼装清单 */
async function readCachedSkins(): Promise<readonly SkinManifest[]> {
  const root = new Directory(Paths.document, CACHE_ROOT);
  if (!root.exists) return [];
  const results: SkinManifest[] = [];
  for (const entry of root.list()) {
    if (!(entry instanceof Directory)) continue;
    const manifest = await firstCompleteCachedManifest(entry.name);
    if (manifest) results.push(manifest);
  }
  return results;
}

/**
 * 启动水合：拉目录 → 每皮肤拉 manifest，资产已齐套才收录（绝不下载）；
 * 清单不可得（门禁/网络/版本升级）回退磁盘齐套版本。目录失败整体回退磁盘缓存。
 */
export async function hydrateRemoteSkins(
  injectableDeps: RemoteSkinsDeps = {},
): Promise<readonly SkinManifest[]> {
  const deps = { ...defaultDeps(), ...injectableDeps };
  let catalog: readonly SkinSummaryRemote[];
  try {
    catalog = await deps.fetchCatalog();
  } catch {
    // 离线/网络异常：回退本地缓存（pull 到本地的皮肤离线继续可用）
    telemetry.track('skin_catalog_fetch_failed');
    return readCachedSkins();
  }
  const results: SkinManifest[] = [];
  for (const summary of catalog) {
    let manifest: SkinManifest | null = null;
    try {
      const raw = await deps.fetchManifest(summary.slug);
      const materialized = materializeManifest(raw, stateFileUri, videoFileUri);
      if (materialized && cachedComplete(materialized.manifest)) {
        await pruneCache(materialized.manifest.slug, materialized.manifest.manifestVersion);
        persistManifest(materialized.manifest.slug, materialized.manifest.manifestVersion, raw);
        manifest = withCardPosters(materialized.manifest);
      }
    } catch (error) {
      // 401/403 是权益门禁的预期路径（未登录/未购），不打点防噪音；其余是
      // 真实可用性损失，必须可观测。
      const status = (error as { status?: number }).status;
      if (status !== 401 && status !== 403) {
        telemetry.track('skin_fetch_failed', {
          slug: summary.slug,
          stage: error instanceof Error ? error.message.slice(0, 80) : 'unknown',
        });
      }
    }
    // 门禁/网络/版本升级导致清单不可用：回退磁盘齐套旧版本（已获包不失联）
    if (!manifest) manifest = await firstCompleteCachedManifest(summary.slug);
    if (manifest) results.push(manifest);
  }
  return results;
}

interface PendingDownload {
  /** 最终就位 uri（fileReady 只认最终名） */
  uri: string;
  /** 下载中的 .part 临时 uri（成功后 rename 就位） */
  partUri: string;
  url: string;
}

/** 清理版本目录内 *.part 残留（上次中断/失败留下的临时文件） */
function clearPartFiles(versionDir: Directory): void {
  try {
    for (const entry of versionDir.list()) {
      if (!(entry instanceof Directory) && entry.name.endsWith('.part')) {
        try {
          entry.delete();
        } catch {
          // 忽略
        }
      }
    }
  } catch {
    // 目录不可读（刚建/并发）：忽略
  }
}

/** `.part` 下载 → 同目录 rename 就位（rename 目标意外存在时走失败路径统一清理） */
async function downloadToPart(
  deps: Required<RemoteSkinsDeps>,
  item: PendingDownload,
  onProgress?: (bytesWritten: number, totalBytes: number) => void,
): Promise<void> {
  await deps.download(item.url, item.partUri, onProgress);
  new File(item.partUri).rename(item.uri.split('/').pop() ?? item.uri);
}

/**
 * 单包按需下载（全有或全无）：任一全图资产失败即放弃——清理 `.part`、不持久化
 * manifest、绝不产出半套清单。已齐套资产按 fileReady 跳过（失败重试只补缺）。
 * 清单 401/403（未登录/未购）原样上抛，由上层归类为 gated。进度只统计全图
 * 资产（缩略图是 best-effort 附加，不占进度、不阻断完成）。
 */
export async function downloadSkinPack(
  slug: string,
  sink: { onProgress?: (progress: PackProgress) => void } = {},
  injectableDeps: RemoteSkinsDeps = {},
): Promise<SkinManifest> {
  const deps = { ...defaultDeps(), ...injectableDeps };
  const raw = await deps.fetchManifest(slug);
  const materialized = materializeManifest(raw, stateFileUri, videoFileUri);
  if (!materialized) throw new Error(`清单物化失败: ${slug}`);
  const { manifest, posterKeys, videoKeys } = materialized;
  const versionDir = ensureDir(manifest.slug, manifest.manifestVersion);
  clearPartFiles(versionDir);

  // 海报+视频齐套才产出：缺任一资产都放弃该皮肤（不做半套渲染）
  const missing: PendingDownload[] = [];
  for (const asset of manifest.states) {
    const posterUri = (asset.poster as { readonly uri: string }).uri;
    if (!fileReady(posterUri)) {
      const objectKey = posterKeys[asset.state] ?? '';
      const url = objectKey ? await deps.resolveAssetUrl(objectKey) : null;
      if (!url) throw new Error(`海报地址解析失败: ${asset.state}`);
      missing.push({ uri: posterUri, partUri: `${posterUri}.part`, url });
    }
    if (asset.loopVideo) {
      const videoUri = (asset.loopVideo as { readonly uri: string }).uri;
      if (!fileReady(videoUri)) {
        const objectKey = videoKeys[asset.state] ?? '';
        const url = objectKey ? await deps.resolveAssetUrl(objectKey) : null;
        if (!url) throw new Error(`视频地址解析失败: ${asset.state}`);
        missing.push({ uri: videoUri, partUri: `${videoUri}.part`, url });
      }
    }
  }

  const assetsTotal = manifest.states.reduce((count, asset) => count + (asset.loopVideo ? 2 : 1), 0);
  const assetsDoneAtStart = assetsTotal - missing.length;
  let assetsDone = assetsDoneAtStart;
  const writtenByAsset = missing.map(() => 0);
  const totalByAsset = missing.map(() => -1);

  const emit = () => {
    if (!sink.onProgress) return;
    let written = 0;
    let total = 0;
    let byteRatioKnown = true;
    for (let index = 0; index < missing.length; index += 1) {
      written += writtenByAsset[index];
      if (totalByAsset[index] < 0) byteRatioKnown = false;
      else total += totalByAsset[index];
    }
    // 字节比只覆盖缺失资产段，按资产数折算回整包比例
    const missingSegment = byteRatioKnown && total > 0
      ? written / total
      : missing.length === 0
        ? 1
        : (assetsDone - assetsDoneAtStart) / missing.length;
    sink.onProgress({
      slug: manifest.slug,
      assetsDone,
      assetsTotal,
      bytesWritten: written,
      totalBytes: byteRatioKnown ? total : -1,
      ratio: Math.min(
        1,
        Math.max(0, (assetsDoneAtStart + missingSegment * missing.length) / assetsTotal),
      ),
    });
  };
  emit();

  try {
    // 同皮肤内并行下载（6 态 × 2 资产串行太慢）；任一失败即放弃该包
    await Promise.all(missing.map((item, index) => (async () => {
      await downloadToPart(deps, item, (written, total) => {
        writtenByAsset[index] = written;
        totalByAsset[index] = total;
        emit();
      });
      assetsDone += 1;
      emit();
    })()));
  } catch (error) {
    clearPartFiles(versionDir);
    throw error;
  }

  if (!cachedComplete(manifest)) {
    clearPartFiles(versionDir);
    throw new Error(`资产校验失败: ${slug}`);
  }

  // 卡片缩略图 best-effort（全图齐套之后才轮到它；失败不放弃皮肤，卡片
  // 回落全图）。thumb objectKey 与服务端双端同约（domain/thumbKey.ts）。
  const thumbDownloads: PendingDownload[] = [];
  for (const asset of manifest.states) {
    const posterKey = posterKeys[asset.state] ?? '';
    const thumbKey = posterKey ? deriveThumbKey(posterKey) : null;
    const thumbUri = stateThumbFileUri(manifest.slug, manifest.manifestVersion, asset.state);
    if (!thumbKey || fileReady(thumbUri)) continue;
    const url = await deps.resolveAssetUrl(thumbKey);
    if (url) thumbDownloads.push({ uri: thumbUri, partUri: `${thumbUri}.part`, url });
  }
  if (thumbDownloads.length > 0) {
    await Promise.all(thumbDownloads.map((item) => downloadToPart(deps, item)))
      .catch(() => { /* 单/全部失败都接受：卡片回落全图，下次下载该包时重试 */ });
    clearPartFiles(versionDir); // 失败缩略图的 .part 残留不留给 fileReady
  }

  persistManifest(manifest.slug, manifest.manifestVersion, raw);
  await pruneCache(manifest.slug, manifest.manifestVersion);
  emit();
  return withCardPosters(manifest);
}
