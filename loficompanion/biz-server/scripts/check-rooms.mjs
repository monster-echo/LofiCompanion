#!/usr/bin/env node
/**
 * 自习室房间白名单跨端一致性校验（零依赖）：
 * RN 侧 assets/study-rooms 下各 room.yaml 生成 rooms.generated.ts，是唯一数据源；
 * 本文件（biz-server/src/features/studyroom/domain/rooms.ts 的 STUDY_ROOM_IDS）
 * 必须与生成产物的 id 集合及顺序逐项一致。仓库无共享包，用文本级比对把门：
 * 不一致即非零退出（挂 react-native CI——房间 yaml 变更经 RN 路径触发）。
 *
 * 用法：node scripts/check-rooms.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));

const rnGeneratedPath = join(
  scriptDir, '..', '..', 'react-native', 'src', 'features', 'studyroom', 'domain', 'rooms.generated.ts',
);
const serverRoomsPath = join(scriptDir, '..', 'src', 'features', 'studyroom', 'domain', 'rooms.ts');

const rnSource = readFileSync(rnGeneratedPath, 'utf8');
const serverSource = readFileSync(serverRoomsPath, 'utf8');

// 生成产物：按 STUDY_ROOMS 数组顺序提取 id 字面量
const rnMatch = rnSource.match(/export const STUDY_ROOMS[^=]*= \[([\s\S]*?)\n\];/);
if (!rnMatch) {
  console.error(`check-rooms: 无法从 ${rnGeneratedPath} 解析 STUDY_ROOMS`);
  process.exit(1);
}
const rnIds = [...rnMatch[1].matchAll(/id: "([^"]+)"/g)].map((m) => m[1]);

// server 侧：按 STUDY_ROOM_IDS 顺序提取字符串字面量
const serverMatch = serverSource.match(/export const STUDY_ROOM_IDS = \[([\s\S]*?)\] as const/);
if (!serverMatch) {
  console.error(`check-rooms: 无法从 ${serverRoomsPath} 解析 STUDY_ROOM_IDS`);
  process.exit(1);
}
const serverIds = [...serverMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

const same =
  rnIds.length === serverIds.length &&
  rnIds.every((id, index) => id === serverIds[index]);

if (!same) {
  console.error('check-rooms: 房间白名单两端不一致，请同步 biz-server/src/features/studyroom/domain/rooms.ts');
  console.error(`  RN（唯一源）: ${JSON.stringify(rnIds)}`);
  console.error(`  biz-server  : ${JSON.stringify(serverIds)}`);
  process.exit(1);
}
console.log(`check-rooms: 房间白名单一致 ✓（${rnIds.length} 间）`);
