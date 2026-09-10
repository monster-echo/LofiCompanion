#!/usr/bin/env node
/**
 * 自习室房间清单生成器：assets/study-rooms/<id>/room.yaml →
 * src/features/studyroom/domain/rooms.generated.ts
 *
 * 与 generate-skin.mjs 同构（构建期生成、运行时零 YAML 解析），但独立脚本：
 * 皮肤生成器保持单一职责（皮肤携带媒体资源 require，房间是纯数据）。
 * 房间是纯数据、无资源 require——node/vitest 环境零兜底分支。
 *
 * 用法：
 *   node scripts/generate-study-rooms.mjs            # 遍历 assets/study-rooms 全部生成
 *   node scripts/generate-study-rooms.mjs --check    # 校验生成物与 YAML 同步（CI）
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(scriptDir, '..');

const assetsRoot = join(pkgRoot, 'assets', 'study-rooms');
const outPath = join(pkgRoot, 'src', 'features', 'studyroom', 'domain', 'rooms.generated.ts');
const check = process.argv.includes('--check');

const roomDirs = readdirSync(assetsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const rooms = roomDirs.map((dir) => {
  const yamlPath = join(assetsRoot, dir, 'room.yaml');
  if (!existsSync(yamlPath)) throw new Error(`generate-study-rooms: 找不到 ${yamlPath}`);
  const doc = parse(readFileSync(yamlPath, 'utf8'));
  for (const field of ['id', 'skin', 'name', 'name_en', 'order', 'displayState']) {
    if (doc[field] === undefined) throw new Error(`generate-study-rooms: ${dir}/room.yaml 缺少字段：${field}`);
  }
  if (doc.id !== dir) {
    throw new Error(`generate-study-rooms: room.yaml id（${doc.id}）与目录名（${dir}）不一致`);
  }
  if (!Number.isInteger(doc.order) || doc.order < 1) {
    throw new Error(`generate-study-rooms: ${dir}/room.yaml order 必须是 ≥1 的整数`);
  }
  // displayState 是房间画面固定基态（drinking/completed 属动作/终态，不作为常驻画面）
  const BASE_STATES = ['ready', 'focusing', 'paused', 'resting'];
  if (!BASE_STATES.includes(doc.displayState)) {
    throw new Error(
      `generate-study-rooms: ${dir}/room.yaml displayState 必须是基态之一（${BASE_STATES.join('/')}）`,
    );
  }
  return doc;
});

const orders = rooms.map((room) => room.order);
if (new Set(orders).size !== orders.length) {
  throw new Error(`generate-study-rooms: order 重复：${orders.join(', ')}（必须唯一）`);
}
rooms.sort((a, b) => a.order - b.order);

const literal = (value) => JSON.stringify(value);
const idUnion = rooms.map((room) => literal(room.id)).join(' | ');

const output = `/**
 * 本文件由 scripts/generate-study-rooms.mjs 从 assets/study-rooms 下各 room.yaml 生成。
 * 请勿手改——编辑 YAML 后运行 \`npm run rooms:generate\` 重新生成；
 * CI/测试用 \`npm run rooms:generate -- --check\` 校验同步。
 * 房间目录以本清单为唯一源；biz-server 侧白名单由 CI 校验脚本对齐。
 */

export type StudyRoomId = ${idUnion};

export interface StudyRoomDef {
  readonly id: StudyRoomId;
  readonly nameZh: string;
  readonly nameEn: string;
  /** 播放内容引用的皮肤 slug（当前与 id 相同；解耦未来房间≠皮肤） */
  readonly skin: string;
  /** 房间画面固定基态：自习室恒按此态循环，不随个人专注会话流转 */
  readonly displayState: 'ready' | 'focusing' | 'paused' | 'resting';
}

/** 房间列表（顺序 = room.yaml order；首位为默认房间）。 */
export const STUDY_ROOMS: readonly StudyRoomDef[] = [
${rooms
  .map(
    (room) => `  {
    id: ${literal(room.id)},
    nameZh: ${literal(room.name)},
    nameEn: ${literal(room.name_en)},
    skin: ${literal(room.skin)},
    displayState: ${literal(room.displayState)},
  },`,
  )
  .join('\n')}
];
`;

if (check) {
  const current = existsSync(outPath) ? readFileSync(outPath, 'utf8') : '';
  if (current !== output) {
    console.error('generate-study-rooms: 生成物与 room.yaml 不同步，请运行 npm run rooms:generate');
    process.exit(1);
  }
  console.log('generate-study-rooms: 生成物已同步 ✓');
} else {
  writeFileSync(outPath, output);
  console.log(`generate-study-rooms: 已生成 ${outPath}`);
}
