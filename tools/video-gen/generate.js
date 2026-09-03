#!/usr/bin/env node
// LofiCompanion 皮肤视频生成管线：海报 → MiniMax H3 → 去音轨 mp4。
//
// 用法（先 `npm install`，并在本目录放 .env 写 MINIMAX_API_KEY=...）：
//   node generate.js --dry-run                          # 打印全部提示词与用量估算
//   node generate.js --skins rainy-study-room --states focusing --resolution 768P
//   node generate.js                                    # 全量：3 皮肤 × 6 状态 @2K
//   node generate.js --keep-audio --keep-raw            # 调试选项
//
// 产物：generated/<slug>/<state>.mp4（无音轨，竖版，跟随海报宽高比）。
// 断点续传：generated/state.json 记录 task_id 与进度，中断后重跑自动续。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import yaml from 'js-yaml';
import { buildPrompt, STATE_SPECS } from './prompts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKINS_DIR = path.resolve(__dirname, '../../loficompanion/react-native/assets/skins');
const OUT_DIR = path.resolve(__dirname, 'generated');
const RAW_DIR = path.join(OUT_DIR, 'raw');
const STATE_FILE = path.join(OUT_DIR, 'state.json');

// 注意：在 loadEnv() 之后调用，不能在模块加载时固化
const apiBase = () => process.env.MINIMAX_BASE_URL || 'https://api.minimax.io';
const MODEL = 'MiniMax-H3';
// 官方建议 10s 轮询；2K 单条生成通常需要数分钟。
const POLL_INTERVAL_MS = 10_000;
const POLL_TIMEOUT_MS = 25 * 60_000;

// ── 参数 ───────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = {
    skins: null, // string[] | null = 全部
    states: null, // string[] | null = 全部
    resolution: '2K', // H3: 768P | 2K
    dryRun: false,
    keepAudio: false,
    keepRaw: false,
    force: false, // 忽略 state.json 已成功记录，强制重生成
    openLoop: false, // 循环态只用首帧（不锁尾帧）——调试用
  };
  const eat = (i, key) => {
    const v = argv[i + 1];
    if (!v) throw new Error(`${key} 缺少参数值`);
    args[key] = v;
    return i + 1;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--skins') i = eat(i, 'skins');
    else if (a === '--states') i = eat(i, 'states');
    else if (a === '--resolution') i = eat(i, 'resolution');
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--keep-audio') args.keepAudio = true;
    else if (a === '--keep-raw') args.keepRaw = true;
    else if (a === '--force') args.force = true;
    else if (a === '--open-loop') args.openLoop = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`未知参数: ${a}`);
  }
  if (args.skins) args.skins = args.skins.split(',');
  if (args.states) args.states = args.states.split(',');
  if (!['768P', '2K'].includes(args.resolution))
    throw new Error(`--resolution 仅支持 768P | 2K（H3），收到: ${args.resolution}`);
  return args;
}

// ── .env 加载（本地密钥，勿入库）─────────────────────────────────────────
function loadEnv() {
  const envFile = path.join(__dirname, '.env');
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  }
}

// ── 皮肤发现 ───────────────────────────────────────────────────────────────
function discoverSkins(filterSlugs, filterStates) {
  const skins = [];
  for (const entry of fs.readdirSync(SKINS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(SKINS_DIR, entry.name);
    const yamlPath = path.join(dir, 'skin.yaml');
    if (!fs.existsSync(yamlPath)) continue;
    const manifest = yaml.load(fs.readFileSync(yamlPath, 'utf8'));
    if (filterSlugs && !filterSlugs.includes(manifest.slug)) continue;
    const states = {};
    for (const s of manifest.states) {
      if (filterStates && !filterStates.includes(s.state)) continue;
      states[s.state] = path.join(dir, s.poster);
    }
    skins.push({ slug: manifest.slug, name: manifest.name, dir, states });
  }
  return skins;
}

// ── MiniMax API ────────────────────────────────────────────────────────────
function authHeaders() {
  const key = process.env.MINIMAX_API_KEY;
  if (!key) throw new Error('缺少 MINIMAX_API_KEY（写入 tools/video-gen/.env 或环境变量）');
  return { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

async function apiCreateTask(body) {
  const res = await fetch(`${apiBase()}/v2/video_generation`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error || !json.task_id) {
    const msg = json?.error?.message || JSON.stringify(json).slice(0, 300);
    throw new Error(`创建任务失败 HTTP ${res.status}: ${msg}`);
  }
  return json.task_id;
}

async function apiQueryTask(taskId) {
  const res = await fetch(`${apiBase()}/v2/query/video_generation/${taskId}`, {
    headers: authHeaders(),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const msg = json?.error?.message || JSON.stringify(json).slice(0, 300);
    throw new Error(`查询任务失败 HTTP ${res.status}: ${msg}`);
  }
  return json.task;
}

function posterToDataUrl(posterPath) {
  const ext = path.extname(posterPath).slice(1).toLowerCase().replace('jpg', 'jpeg');
  const b64 = fs.readFileSync(posterPath).toString('base64');
  return `data:image/${ext};base64,${b64}`;
}

// ── 下载与去音轨 ───────────────────────────────────────────────────────────
async function downloadTo(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

function stripAudio(src, dest) {
  // -an 去音轨；-c:v copy 不重编码、零画质损失。
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-an', '-c:v', 'copy', dest]);
}

// ── 状态持久化（断点续传）─────────────────────────────────────────────────
function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}
function saveState(state) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ── 主流程 ─────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('见文件头部注释或 README.md');
    return;
  }
  loadEnv();

  const skins = discoverSkins(args.skins, args.states);
  if (!skins.length) {
    console.error('未匹配到皮肤/状态，检查 --skins --states 过滤条件');
    process.exit(1);
  }

  // 组装任务清单
  const jobs = [];
  for (const skin of skins) {
    for (const [state, poster] of Object.entries(skin.states)) {
      const spec = STATE_SPECS[state];
      if (!spec) continue; // skin.yaml 里出现未知状态时跳过
      const { prompt, loop } = buildPrompt({
        skinKey: skin.slug,
        state,
        duration: spec.duration,
        loop: args.openLoop ? false : undefined,
      });
      jobs.push({
        key: `${skin.slug}/${state}`,
        slug: skin.slug,
        state,
        poster,
        prompt,
        loop,
        duration: spec.duration,
      });
    }
  }

  const totalSeconds = jobs.reduce((n, j) => n + j.duration, 0);
  console.log(`任务 ${jobs.length} 条 · 共 ${totalSeconds}s 视频 · ${args.resolution} · model=${MODEL}`);
  console.log(`循环态 ${jobs.filter((j) => j.loop).length} 条（首尾帧锁定）· 动作态 ${jobs.filter((j) => !j.loop).length} 条\n`);

  if (args.dryRun) {
    for (const j of jobs) {
      console.log('='.repeat(72));
      console.log(`# ${j.key}  [${j.loop ? 'loop' : 'one-shot'} · ${j.duration}s · 首帧 ${path.basename(j.poster)}${j.loop ? ' + 尾帧同图' : ''}]`);
      console.log('-'.repeat(72));
      console.log(j.prompt);
      console.log();
    }
    return;
  }

  fs.mkdirSync(RAW_DIR, { recursive: true });
  const state = loadState();
  const pending = [];

  // 1) 提交（顺序提交，任务在服务端并行生成）
  for (const job of jobs) {
    const prev = state[job.key];
    if (
      !args.force &&
      prev?.status === 'succeeded' &&
      prev.resolution === args.resolution && // 低分辨率试跑的记录不算数
      prev.file &&
      fs.existsSync(prev.file)
    ) {
      console.log(`↷ 已完成，跳过: ${job.key}`);
      continue;
    }
    if (prev?.task_id && prev.status !== 'failed' && !args.force) {
      // 复用已有 task_id（上次中断）
      state[job.key] = { ...prev, status: prev.status || 'submitted' };
      pending.push({ ...job, taskId: prev.task_id });
      console.log(`… 复用任务 ${prev.task_id}: ${job.key}`);
      continue;
    }

    const content = [
      { type: 'text', text: job.prompt },
      {
        type: 'image_url',
        image_url: { url: posterToDataUrl(job.poster) },
        role: 'first_frame',
      },
    ];
    if (job.loop) {
      content.push({
        type: 'image_url',
        image_url: { url: posterToDataUrl(job.poster) },
        role: 'last_frame',
      });
    }

    process.stdout.write(`↑ 提交: ${job.key} ... `);
    try {
      const taskId = await apiCreateTask({
        model: MODEL,
        content,
        resolution: args.resolution,
        duration: job.duration,
        // I2V 宽高比固定 adaptive（跟随海报 1290×2796），无需传 ratio
      });
      state[job.key] = {
        task_id: taskId,
        status: 'submitted',
        loop: job.loop,
        duration: job.duration,
        resolution: args.resolution,
        file: path.join(OUT_DIR, job.slug, `${job.state}.mp4`),
        updatedAt: new Date().toISOString(),
      };
      saveState(state);
      pending.push({ ...job, taskId });
      console.log(`task_id=${taskId}`);
    } catch (err) {
      console.log('失败');
      console.error(`  ${err.message}`);
      state[job.key] = { ...(prev || {}), status: 'failed', error: err.message, updatedAt: new Date().toISOString() };
      saveState(state);
    }
    await sleep(1000); // 轻微间隔，避免触发提交侧限流
  }

  // 2) 轮询至全部到达终态
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (pending.some((p) => !p.done) && Date.now() < deadline) {
    const active = pending.filter((p) => !p.done);
    await sleep(POLL_INTERVAL_MS);
    for (const p of active) {
      let task;
      try {
        task = await apiQueryTask(p.taskId);
      } catch (err) {
        console.log(`  ⚠ ${p.key} 查询异常（下轮重试）: ${err.message}`);
        continue;
      }
      const status = task.status;
      if (status === 'succeeded' && !p.downloaded) {
        const rawPath = path.join(RAW_DIR, `${p.slug}-${p.state}-raw.mp4`);
        const finalPath = path.join(OUT_DIR, p.slug, `${p.state}.mp4`);
        try {
          await downloadTo(task.content.url, rawPath);
          fs.mkdirSync(path.dirname(finalPath), { recursive: true });
          if (args.keepAudio) {
            fs.copyFileSync(rawPath, finalPath);
          } else {
            stripAudio(rawPath, finalPath);
          }
          if (!args.keepRaw) fs.rmSync(rawPath, { force: true });
          p.downloaded = true;
          state[p.key] = {
            ...state[p.key],
            status: 'succeeded',
            file: finalPath,
            error: null,
            updatedAt: new Date().toISOString(),
          };
          console.log(`  ✔ ${p.key} 完成 → ${path.relative(__dirname, finalPath)}`);
        } catch (err) {
          console.log(`  ⚠ ${p.key} 下载/转码异常（下轮重试）: ${err.message}`);
          continue;
        }
      } else if (status === 'failed' || status === 'cancelled') {
        p.done = true;
        state[p.key] = {
          ...state[p.key],
          status: 'failed',
          error: task.error?.message || status,
          updatedAt: new Date().toISOString(),
        };
        console.log(`  ✘ ${p.key} ${status}`);
      } else {
        process.stdout.write(`  … ${p.key} ${status}\n`);
      }
      saveState(state);
    }
  }

  // 3) 汇总
  const rows = jobs.map((j) => ({ key: j.key, ...pick(state[j.key] || {}) }));
  console.log(`\n${'─'.repeat(60)}`);
  for (const r of rows) {
    const icon = r.status === 'succeeded' ? '✔' : r.status === 'failed' ? '✘' : '…';
    console.log(`${icon} ${r.key}  [${r.status || '未提交'}]${r.error ? '  ' + r.error : ''}`);
  }
  const failed = rows.filter((r) => r.status !== 'succeeded');
  console.log(
    failed.length
      ? `\n${failed.length} 条未完成 —— 直接重跑本命令自动续传/重试。`
      : `\n全部完成。视频为无音轨竖版，宽高比与海报一致。`,
  );
  if (failed.length) process.exitCode = 1;
}

function pick(obj) {
  const { task_id, status, file, error } = obj;
  return { task_id, status, file, error };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
