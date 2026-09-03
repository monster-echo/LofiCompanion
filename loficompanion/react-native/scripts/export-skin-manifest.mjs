#!/usr/bin/env node
/**
 * 皮肤清单导出器：assets/skins/<slug>/skin.yaml → biz-server/scripts/skin-manifests/<slug>.manifest.json
 *
 * 皮肤云端化后（P2），阳光教室/深夜工作台的清单不再随包分发，改由 biz-server
 * 下发；本脚本把 skin.yaml 转成 publish-skin.mjs 可直接消费的发布 manifest：
 *   posterUrl/videoUrl 填本地文件名（发布脚本直传后改写为裸 objectKey），
 *   events→eventMappings、animation/wellness/name_en→nameEn 原样透传。
 *
 * 用法：
 *   node scripts/export-skin-manifest.mjs [slug]   # 缺省遍历 assets/skins 全部
 *
 * 发布（在 loficompanion/biz-server 下）：
 *   BIZ_ADMIN_KEY=<key> \
 *   SKIN_MANIFEST=scripts/skin-manifests/<slug>.manifest.json \
 *   SKIN_POSTERS=../react-native/assets/skins/<slug> \
 *   node scripts/publish-skin.mjs
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(scriptDir, '..');
const assetsRoot = join(pkgRoot, 'assets', 'skins');
const outDir = join(pkgRoot, '..', 'biz-server', 'scripts', 'skin-manifests');

// 与 src/features/skins/domain/types.ts 的 CompanionState / CompanionEventType 保持一致
const COMPANION_STATES = ['ready', 'focusing', 'paused', 'drinking', 'resting', 'completed'];
const ACCESS_TYPES = ['free', 'paid', 'premium'];

// paid 皮肤定价与支付配置（商店域唯一真源，biz skin_products 行由此登记）：
// 深夜工作台 $0.99，原生 IAP，双端同 ID
const MIDNIGHT_STORE_PRODUCT_ID = 'tech.zhongbei.loficompanion.theme.midnight';
const PRICE_BY_SLUG = {
  'midnight-workstation': {
    priceMinor: 99,
    currency: 'USD',
    provider: 'store',
    storeProductIds: { apple: MIDNIGHT_STORE_PRODUCT_ID, google: MIDNIGHT_STORE_PRODUCT_ID },
  },
};

const slugArg = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
const slugs = slugArg
  ? [slugArg]
  : readdirSync(assetsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

let failed = false;
for (const slug of slugs) {
  try {
    exportSkin(slug);
  } catch (error) {
    console.error(`export-skin-manifest: ${error.message}`);
    failed = true;
  }
}
if (failed) process.exit(1);

function exportSkin(slug) {
  const skinDir = join(assetsRoot, slug);
  const yamlPath = join(skinDir, 'skin.yaml');
  if (!existsSync(yamlPath)) throw new Error(`找不到 ${yamlPath}`);
  const doc = parse(readFileSync(yamlPath, 'utf8'));

  // ---- 校验（与 generate-skin.mjs 同口径的发布最小集）----
  for (const field of ['slug', 'name', 'accessType', 'defaultState', 'themeTokens']) {
    if (doc[field] === undefined) throw new Error(`skin.yaml 缺少字段：${field}`);
  }
  if (doc.slug !== slug) throw new Error(`skin.yaml slug（${doc.slug}）与目录名（${slug}）不一致`);
  if (!ACCESS_TYPES.includes(doc.accessType)) throw new Error(`未知 accessType：${doc.accessType}`);
  if (!COMPANION_STATES.includes(doc.defaultState)) throw new Error(`未知 defaultState：${doc.defaultState}`);

  const stateEntries = doc.states ?? [];
  if (stateEntries.length === 0) throw new Error('skin.yaml states 为空');
  for (const entry of stateEntries) {
    if (!COMPANION_STATES.includes(entry.state)) throw new Error(`未知状态：${entry.state}`);
    if (!entry.poster || !existsSync(join(skinDir, entry.poster))) {
      throw new Error(`状态 ${entry.state} 的海报不存在：${entry.poster}`);
    }
    if (entry.video && !existsSync(join(skinDir, entry.video))) {
      throw new Error(`状态 ${entry.state} 的视频不存在：${entry.video}`);
    }
  }

  // ---- 组装发布 manifest（posterUrl/videoUrl 填本地文件名，发布脚本直传后改写）----
  const defaults = doc.defaults ?? {};
  const manifest = {
    slug: doc.slug,
    name: doc.name,
    ...(doc.name_en ? { nameEn: doc.name_en } : {}),
    accessType: doc.accessType,
    defaultState: doc.defaultState,
    themeTokens: { accent: doc.themeTokens.accent, surface: doc.themeTokens.surface },
    ...(doc.animation ? { animation: doc.animation } : {}),
    ...(doc.wellness ? { wellness: doc.wellness } : {}),
    states: stateEntries.map((entry) => ({
      state: entry.state,
      posterUrl: entry.poster,
      ...(entry.video ? { videoUrl: entry.video, videoLoop: entry.videoLoop } : {}),
      focalPointX: entry.focal?.x ?? defaults.focal?.x ?? 0.5,
      focalPointY: entry.focal?.y ?? defaults.focal?.y ?? 0.38,
      durationMs: entry.durationMs ?? defaults.durationMs ?? 4000,
    })),
    eventMappings: (doc.events ?? []).map((event) => ({
      eventType: event.eventType,
      priority: event.priority,
      interruptible: event.interruptible,
      cooldownSeconds: event.cooldownSeconds ?? 0,
      returnState: event.returnState,
    })),
    // paid 定价/支付配置随 manifest 顶层携带（publish-skin.mjs 读取并透传 auth 商品行）
    ...(PRICE_BY_SLUG[slug] ?? {}),
  };

  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `${slug}.manifest.json`);
  writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`export-skin-manifest: ${slug} → ${outPath}`);
}
