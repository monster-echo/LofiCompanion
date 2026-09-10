#!/usr/bin/env node
/**
 * 回填全部已发布皮肤的卡片缩略图（POST /api/v1/admin/skins/thumbs）：
 * 幂等——thumb 已在位的直接跳过；发布管线（publish-skin.mjs）已内置生成，
 * 本脚本服务存量皮肤一次性补齐与失败补拉。
 *
 * 用法：
 *   BIZ_ADMIN_KEY=<x-biz-key> node scripts/backfill-skin-thumbs.mjs
 *
 * 可选环境变量：
 *   BIZ_BASE_URL         默认 https://lofi-biz.zhongbei.tech
 *   AUTH_APP_ID          默认 loficompanion
 *   AUTH_APP_ENVIRONMENT 默认 production
 */

const BASE = (process.env.BIZ_BASE_URL ?? 'https://lofi-biz.zhongbei.tech').replace(/\/+$/, '');
const APP_ID = process.env.AUTH_APP_ID ?? 'loficompanion';
const ENVIRONMENT = process.env.AUTH_APP_ENVIRONMENT ?? 'production';
const KEY = process.env.BIZ_ADMIN_KEY;

if (!KEY) {
  console.error('缺少鉴权：请设置 BIZ_ADMIN_KEY（与 biz-server env 一致）');
  process.exit(1);
}

const response = await fetch(`${BASE}/api/v1/admin/skins/thumbs`, {
  method: 'POST',
  headers: {
    'x-app-id': APP_ID,
    'x-app-environment': ENVIRONMENT,
    'x-biz-key': KEY,
  },
});
const payload = await response.json().catch(() => ({}));
if (!response.ok) {
  console.error(`回填失败: ${payload?.error?.code ?? ''} ${payload?.error?.message ?? `HTTP ${response.status}`}`);
  process.exit(1);
}

const { skins, total, perSkin } = payload.data ?? payload;
console.log(`✅ 回填完成：${skins} 个皮肤，生成 ${total.generated}、已在位 ${total.exists}、失败 ${total.failed}`);
for (const skin of perSkin ?? []) {
  const mark = skin.failed > 0 ? '⚠️' : ' ';
  console.log(`${mark} ${skin.slug}: ${skin.posters} 张海报 → 生成 ${skin.generated} / 在位 ${skin.exists} / 失败 ${skin.failed}`);
}
if (total.failed > 0) process.exit(2);
