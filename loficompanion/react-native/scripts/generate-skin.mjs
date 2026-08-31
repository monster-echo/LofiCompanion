#!/usr/bin/env node
/**
 * 皮肤清单生成器：assets/skins/<slug>/skin.yaml →
 * src/features/skins/domain/<camelCase slug>.generated.ts
 *
 * 为什么构建期生成而不是运行时解析 YAML：
 * 1. Metro 只接受字面量 require() 注册海报资源——路径必须在源码里写死；
 * 2. 运行时零解析成本、零 YAML 依赖（yaml 仅 devDependency）。
 *
 * 用法：
 *   node scripts/generate-skin.mjs [slug]            # 生成单套；缺省遍历 assets/skins 全部
 *   node scripts/generate-skin.mjs [slug] --check    # 校验生成物与 YAML 同步（CI，可叠加 slug）
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(scriptDir, '..');

// 与 src/features/skins/domain/types.ts 的 CompanionState / CompanionEventType 保持一致；
// 两处一旦漂移，此处的校验会立即报错。
const COMPANION_STATES = ['ready', 'focusing', 'paused', 'drinking', 'resting', 'completed'];
const COMPANION_EVENTS = [
  'session.ready', 'focus.started', 'focus.loop', 'wellness.drink',
  'focus.paused', 'break.started', 'focus.resumed', 'focus.completed',
];
const ACCESS_TYPES = ['free', 'paid', 'premium'];

const args = process.argv.slice(2);
const check = args.includes('--check');
const slugArg = args.find((arg) => !arg.startsWith('--'));
const assetsRoot = join(pkgRoot, 'assets', 'skins');
const slugs = slugArg
  ? [slugArg]
  : readdirSync(assetsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

let failed = false;
for (const slug of slugs) {
  try {
    runSkin(slug, check);
  } catch (error) {
    console.error(`generate-skin: ${error.message}`);
    failed = true;
  }
}
if (failed) process.exit(1);

function runSkin(slug, checkMode) {
  const skinDir = join(assetsRoot, slug);
  const yamlPath = join(skinDir, 'skin.yaml');
  const fail = (message) => {
    throw new Error(message);
  };

  if (!existsSync(yamlPath)) fail(`找不到 ${yamlPath}`);
  const doc = parse(readFileSync(yamlPath, 'utf8'));

  // ---- 校验 ----
  for (const field of ['id', 'slug', 'name', 'accessType', 'manifestVersion', 'defaultState', 'themeTokens']) {
    if (doc[field] === undefined) fail(`skin.yaml 缺少字段：${field}`);
  }
  if (doc.slug !== slug) fail(`skin.yaml slug（${doc.slug}）与目录名（${slug}）不一致`);
  if (!ACCESS_TYPES.includes(doc.accessType)) fail(`未知 accessType：${doc.accessType}`);
  if (!COMPANION_STATES.includes(doc.defaultState)) fail(`未知 defaultState：${doc.defaultState}`);

  const stateEntries = doc.states ?? [];
  const seenStates = new Set();
  for (const entry of stateEntries) {
    if (!COMPANION_STATES.includes(entry.state)) fail(`未知状态：${entry.state}`);
    if (seenStates.has(entry.state)) fail(`状态重复：${entry.state}`);
    seenStates.add(entry.state);
    const posterPath = join(skinDir, entry.poster ?? '');
    if (!entry.poster || !existsSync(posterPath)) fail(`状态 ${entry.state} 的海报不存在：${posterPath}`);
  }
  for (const state of COMPANION_STATES) {
    if (!seenStates.has(state)) fail(`skin.yaml 缺少状态：${state}（types.ts CompanionState 要求全覆盖）`);
  }
  const defaults = doc.defaults ?? {};
  for (const event of doc.events ?? []) {
    if (!COMPANION_EVENTS.includes(event.eventType)) fail(`未知事件：${event.eventType}`);
    if (typeof event.priority !== 'number') fail(`事件 ${event.eventType} 缺少 priority`);
    if (typeof event.interruptible !== 'boolean') fail(`事件 ${event.eventType} 缺少 interruptible`);
    if (!COMPANION_STATES.includes(event.returnState)) fail(`事件 ${event.eventType} returnState 非法`);
  }

  // ---- 代码片段 ----
  const camel = slug.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
  const manifestName = `${camel}Manifest`;
  const relAssetPrefix = '../../../../assets/skins';
  const focalOf = (entry) => entry.focal ?? defaults.focal ?? { x: 0.5, y: 0.5 };
  const durationOf = (entry) => entry.durationMs ?? defaults.durationMs ?? 4000;
  const literal = (value) => JSON.stringify(value);

  const posterTable = `const POSTERS: Readonly<Record<CompanionState, number>> = (() => {
  try {
    // Metro 静态收集 require('<literal>')——路径必须是字面量
    return {
${stateEntries.map((entry) => `      ${entry.state}: require('${relAssetPrefix}/${slug}/${entry.poster}'),`).join('\n')}
    };
  } catch {
    // 非 Metro 环境（node/vitest）：资源 require 不可用，域逻辑只透传引用
    return {
${stateEntries.map((entry) => `      ${entry.state}: 0,`).join('\n')}
    };
  }
})();`;

  const focalTables = `const FOCAL_X: Record<CompanionState, number> = {
${stateEntries.map((entry) => `  ${entry.state}: ${focalOf(entry).x},`).join('\n')}
};

const FOCAL_Y: Record<CompanionState, number> = {
${stateEntries.map((entry) => `  ${entry.state}: ${focalOf(entry).y},`).join('\n')}
};

const DURATION_MS: Record<CompanionState, number> = {
${stateEntries.map((entry) => `  ${entry.state}: ${durationOf(entry)},`).join('\n')}
};`;

  const eventList = (doc.events ?? [])
    .map((event) => `    {
      eventType: ${literal(event.eventType)},
      priority: ${event.priority},
      interruptible: ${event.interruptible},
      cooldownSeconds: ${event.cooldownSeconds ?? 0},
      returnState: ${literal(event.returnState)},
    },`)
    .join('\n');

  const animation = doc.animation
    ? `  animation: { crossfadeMs: ${doc.animation.crossfadeMs}, focalZoom: ${doc.animation.focalZoom} },`
    : '';
  const autoDrink = doc.wellness?.autoDrink;
  const wellness = autoDrink
    ? `  wellness: {
    autoDrink: {
      enabled: ${autoDrink.enabled},
      minIntervalMinutes: ${autoDrink.minIntervalMinutes},
      maxIntervalMinutes: ${autoDrink.maxIntervalMinutes},
    },
  },`
    : '';

  const output = `/**
 * 本文件由 scripts/generate-skin.mjs 从 assets/skins/${slug}/skin.yaml 生成。
 * 请勿手改——编辑 YAML 后运行 \`npm run skins:generate\` 重新生成；
 * CI/测试用 \`npm run skins:generate -- --check\` 校验同步。
 */
import type {
  CompanionState,
  SkinEventMapping,
  SkinManifest,
} from './types';

declare const require: (id: string) => number;

${posterTable}

${focalTables}

const ALL_STATES: readonly CompanionState[] = [
${stateEntries.map((entry) => `  ${literal(entry.state)},`).join('\n')}
];

/** 内置皮肤「${doc.name}」（清单源：assets/skins/${slug}/skin.yaml） */
export const ${manifestName}: SkinManifest = {
  id: ${literal(doc.id)},
  slug: ${literal(doc.slug)},
  name: ${literal(doc.name)},
  accessType: ${literal(doc.accessType)},
  manifestVersion: ${doc.manifestVersion},
  defaultState: ${literal(doc.defaultState)},
  states: ALL_STATES.map((state) => ({
    state,
    poster: POSTERS[state],
    focalPointX: FOCAL_X[state],
    focalPointY: FOCAL_Y[state],
    durationMs: DURATION_MS[state],
  })),
  eventMappings: [
${eventList}
  ],
  themeTokens: { accent: ${literal(doc.themeTokens.accent)}, surface: ${literal(doc.themeTokens.surface)} },
${animation}
${wellness}
};
`;

  const outPath = join(pkgRoot, 'src', 'features', 'skins', 'domain', `${camel}.generated.ts`);
  if (checkMode) {
    const current = existsSync(outPath) ? readFileSync(outPath, 'utf8') : '';
    if (current !== output) {
      fail(`生成物与 skin.yaml 不同步：${outPath}\n请运行 npm run skins:generate`);
    }
    console.log(`generate-skin: ${slug} 生成物已同步 ✓`);
  } else {
    writeFileSync(outPath, output);
    console.log(`generate-skin: 已生成 ${outPath}`);
  }
}
