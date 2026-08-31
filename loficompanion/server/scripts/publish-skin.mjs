#!/usr/bin/env node
/**
 * 发布一个皮肤到 auth.zhongbei.tech（免审核发新皮肤，P0-B）：
 *   1. 读取 SKIN_MANIFEST 指向的 manifest.json（含 slug/name/accessType 与 states）
 *   2. SKIN_POSTERS 目录下按 states[].posterUrl 指向的本地文件名（如 focusing.png）
 *      逐张经 /api/v1/admin/skins/assets 签发 presigned PUT 直传 OSS
 *   3. posterUrl 改写为裸 objectKey（服务端拒绝 http(s)/s3:// 形态）
 *   4. POST /api/v1/admin/skins/publish（manifest 版本由服务端递增并盖章）
 *   5. GET /api/v1/skins 校验已发布且版本正确
 *
 * 用法：
 *   SKIN_MANIFEST=./my-skin.json SKIN_POSTERS=./my-skin-posters \
 *   AUTH_ADMIN_COOKIE='<管理端 cookie>' node scripts/publish-skin.mjs
 *
 * 鉴权（二选一，同 push-legal.mjs）：
 *   生产：AUTH_ADMIN_COOKIE='<管理端登录后的 cookie>'
 *   非生产：AUTH_ADMIN_KEY=<x-admin-key>（此时 AUTH_APP_ID 默认 loficompanion）
 *
 * 可选环境变量：
 *   AUTH_BASE_URL        默认 https://auth.zhongbei.tech
 *   AUTH_APP_ID          x-admin-key 路径必填（默认 loficompanion）
 *   AUTH_APP_ENVIRONMENT 默认 production
 *   SKIN_DRY_RUN=1       只校验鉴权与 manifest，不上传不发布
 *
 * manifest.json 示例（posterUrl 填本地文件名，上传后自动改写为 objectKey）：
 * {
 *   "slug": "pilot-skin", "name": "试发布皮肤", "accessType": "free",
 *   "defaultState": "ready",
 *   "themeTokens": { "accent": "#4F8FE8", "surface": "#0D1B2B" },
 *   "states": [
 *     { "state": "ready",    "posterUrl": "ready.png",    "focalPointX": 0.5, "focalPointY": 0.38, "durationMs": 4000 },
 *     { "state": "focusing", "posterUrl": "focusing.png", "focalPointX": 0.5, "focalPointY": 0.38, "durationMs": 4000 }
 *   ]
 * }
 * accessType=paid 时可带 "priceMinor"（分）与 "entitlementKey"。
 */

const BASE = (process.env.AUTH_BASE_URL ?? 'https://auth.zhongbei.tech').replace(/\/+$/, '');
const APP_ID = process.env.AUTH_APP_ID ?? 'loficompanion';
const ENVIRONMENT = process.env.AUTH_APP_ENVIRONMENT ?? 'production';
const COOKIE = process.env.AUTH_ADMIN_COOKIE;
const KEY = process.env.AUTH_ADMIN_KEY;
const DRY_RUN = process.env.SKIN_DRY_RUN === '1';

if (!COOKIE && !KEY) {
  console.error('缺少鉴权：请设置 AUTH_ADMIN_COOKIE（生产）或 AUTH_ADMIN_KEY（非生产）');
  process.exit(1);
}
const manifestPath = process.env.SKIN_MANIFEST;
const postersDir = process.env.SKIN_POSTERS;
if (!manifestPath) {
  console.error('缺少 SKIN_MANIFEST（manifest.json 路径）');
  process.exit(1);
}

const fs = await import('node:fs');
const path = await import('node:path');

function headers(json = true) {
  const h = {
    'x-app-id': APP_ID,
    'x-app-environment': ENVIRONMENT,
  };
  if (COOKIE) h.cookie = COOKIE;
  else h['x-admin-key'] = KEY;
  if (json) h['content-type'] = 'application/json';
  return h;
}

async function api(method, urlPath, body, json = true) {
  const response = await fetch(`${BASE}${urlPath}`, {
    method,
    headers: headers(json),
    body: body === undefined ? undefined : json ? JSON.stringify(body) : body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.error?.message ?? `HTTP ${response.status}`;
    throw new Error(`${method} ${urlPath} 失败: ${payload?.error?.code ?? ''} ${detail}`);
  }
  return payload.data ?? payload;
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const { slug, name, accessType = 'free' } = manifest;
if (!slug || !name) {
  console.error('manifest 缺少 slug/name');
  process.exit(1);
}
const states = Array.isArray(manifest.states) ? manifest.states : [];
if (states.length === 0) {
  console.error('manifest.states 为空');
  process.exit(1);
}

console.log(`皮肤: ${slug}（${name}，${accessType}），状态数 ${states.length}`);

// ---- 1) 海报直传：posterUrl 本地文件名 → objectKey ----
const contentTypeByExt = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
if (!DRY_RUN) {
  for (const state of states) {
    const localName = String(state.posterUrl);
    if (/^https?:/i.test(localName) || localName.startsWith('loficompanion/')) continue; // 已是远端 key
    const file = path.resolve(postersDir ?? path.dirname(manifestPath), localName);
    if (!fs.existsSync(file)) {
      console.error(`海报文件不存在: ${file}（states[${state.state}].posterUrl=${localName}）`);
      process.exit(1);
    }
    const ext = path.extname(file).toLowerCase();
    const contentType = contentTypeByExt[ext];
    if (!contentType) {
      console.error(`不支持的海报格式: ${file}`);
      process.exit(1);
    }
    const objectKey = `skins/${slug}/${localName}`;
    const sign = await api('POST', '/api/v1/admin/skins/assets', { path: objectKey, contentType });
    const put = await fetch(sign.uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': contentType },
      body: fs.readFileSync(file),
    });
    if (!put.ok) throw new Error(`海报上传失败 ${put.status}: ${objectKey}`);
    // sign.objectKey 已含 <appId>/<environment>/ 前缀（= /storage/urls 认可的完整 key）
    state.posterUrl = sign.objectKey;
    console.log(`  ↑ ${localName} → ${state.posterUrl}（${(fs.statSync(file).size / 1024).toFixed(0)}KB）`);
  }
} else {
  console.log('DRY_RUN：跳过海报上传');
}

// ---- 2) 发布（服务端递增 manifestVersion 并归一化 id/slug/name）----
const publishBody = { slug, name, accessType, manifest: states.length ? manifest : undefined };
if (accessType === 'paid') {
  publishBody.priceMinor = manifest.priceMinor;
  publishBody.currency = manifest.currency;
  publishBody.entitlementKey = manifest.entitlementKey;
}
if (DRY_RUN) {
  console.log('DRY_RUN：跳过发布。manifest 结构校验通过。');
  process.exit(0);
}
const published = await api('POST', '/api/v1/admin/skins/publish', publishBody);
console.log(`✅ 发布成功: ${published.slug} v${published.manifestVersion}（${published.skinId}）`);

// ---- 3) verify：公开目录可见 ----
const catalog = await api('GET', '/api/v1/skins');
const hit = (catalog.skins ?? []).find((skin) => skin.slug === slug);
if (hit && hit.manifestVersion === published.manifestVersion) {
  console.log(`✅ verify: GET /api/v1/skins 已见 ${hit.slug} v${hit.manifestVersion}（${hit.accessType}）`);
} else if (hit) {
  console.warn(`⚠️ verify: 目录版本 v${hit.manifestVersion} ≠ 发布版本 v${published.manifestVersion}`);
} else {
  console.warn('⚠️ verify: 公开目录暂未见该皮肤（paid/premium 为正常——manifest 端点按权益门禁放行）');
}
