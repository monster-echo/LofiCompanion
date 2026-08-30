# P0-B 服务端与账号同步 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付 doc 06 §2 P0-B：Focus/Skin/Achievement API + PostgreSQL schema、会话幂等同步与服务端结算、成就账本、版本化皮肤 manifest、登录后游客记录迁移（只迁移一次、不重复结算）。验收：同一完成请求重放十次只产生一次会话结算和一次成就发放。

**Architecture:** LofiCompanion 独立 server（`loficompanion/server`，Next.js + PostgreSQL，模板 commit 已记录）。新增三个业务域沿用模板 server 模式（`src/features/<域>/{domain,data}` + `src/app/api/v1/...` route handlers + `requireAuth` JWT 中间件，参照 `src/server/auth.ts` 与既有 `tests/*.test.ts` 的 node:test 模式）。幂等三件套：会话 `userId+clientRequestId` 唯一、完成 `Idempotency-Key` 表、成就 `sourceSessionId+ruleVersion` 唯一。客户端保持 local-first：SyncEngine 离线队列 + 登录触发一次性迁移，失败可重试，不阻塞本地闭环。

**Tech Stack:** Next.js App Router route handlers、PostgreSQL 16（本机 brew，`postgresql://zhongbei_auth:change-me@localhost:5432/zhongbei_lofi`）、node:test + 真库集成测试（模板既有模式）、客户端 Expo RN + 既有 apiClient。

**规范真源：**
- API 路由与错误码：`docs/04-DATA-AND-API.md`（§1 实体、§2 约束、§3 路由、§5 错误码）
- 结算规则：`docs/03-ARCHITECTURE.md` §5（服务端校验并发/区间/时钟偏差、结算事务同写 outbox）、§9（成就/榜单一致性）
- 计费边界：P0-B 不含支付/生成/积分（P1）；排行榜/小组为 P0-C，本阶段不做
- 事件与成就规则：客户端 `src/features/{focus,achievements}/domain`（服务端移植同语义 ruleVersion 1）

**模板事实（已侦察/执行核实）：**
- server 测试：`npm test`（node:test，4 文件）；`AUTH_DATABASE_URL=postgresql://zhongbei_auth:change-me@localhost:5432/zhongbei_lofi` 下 **56/58 通过**；独立库 `zhongbei_lofi` 已建（与模板旧库 `zhongbei_auth` 隔离）。剩余 2 个失败套件见 Task 0。
- `src/server/database.ts`：模块级单例 + 顶层 `await ensureBootstrap()`（DDL/config 种子/测试账号回填，advisory lock `0x5a48_4f4e`）；测试需真实库。
- 认证：RS256 JWT + sid 撤销（commit ceb91f3/ceb91f3 系列），`requireAuth` 中间件在 `src/server/`；JWT 密钥经环境变量。
- 客户端：`src/data/apiClient.ts`（`EXPO_PUBLIC_API_URL` 默认 localhost:3210）；P0-A 全部本地闭环与 FocusStore 已就绪（109 测试）；RN 集成套件 `src/__tests__/{apiClient,purchaseFlow}.test.ts` 是打真 dev server 的模式范例。
- CLI feature 边界已建：`server/src/features/{focus,skins,achievements,leaderboards,generation}/`（四层空目录）。

**明确不在 P0-B（防 creep）：** 排行榜/小组（P0-C）、支付与商店（P1-A）、AI 生成与积分（P1-B）、对象存储/CDN 正式接入（manifest 先走 API 直发+本地文件存储适配器，接口预留）、推送、多端（Flutter/ArkTS）。

---

### Task 0: server 本地基线全绿（诊断 2 个失败套件）

现状：`AUTH_DATABASE_URL=...zhongbei_lofi npm test` → 56/58；失败集中在 auth 套件部分用例（如 `development test account signs in` → `INVALID_CREDENTIALS`，`refresh token rotates` 等）与 payment 套件部分用例（`issueEntitlements 按 tier 发放权益且幂等`、`insertWebhookEventIfNew` 去重、`upsertSubscription` 幂等、`同一 webhook 投递 10 次只处理 1 次`——注意这些恰是幂等语义用例，必须搞清是真缺陷还是测试前置不满足）。

- [ ] Step 1: 全新空库复跑（`createdb zhongbei_lofi_p0b` + 指向它）区分「脏状态」vs「代码/前置问题」
- [ ] Step 2: 逐个失败诊断：读测试断言 → 读实现（`src/server/auth.ts`、entitlements/webhook 数据层）→ 定位（疑似方向：JWT 环境变量未设；测试账号回填与既有 users 表冲突；webhook/entitlement 幂等用例依赖某迁移或配置种子未在fresh库执行）
- [ ] Step 3: 修复（实现或测试前置），`npm test` 58/58 全绿；若是模板级缺陷，同步修 mobiestarter 源并提交那边
- [ ] Step 4: `.env` 落地 `AUTH_DATABASE_URL=postgresql://zhongbei_auth:change-me@localhost:5432/zhongbei_lofi`（`.env` 已 gitignore）+ 把「本地数据库前置」事实更新进 `docs/06` §1.2；Commit

### Task 1: 数据库 schema——focus/skins/achievements 域

**Files:** `server/src/features/{focus,skins,achievements}/data/schema.ts`（新）+ `src/server/database.ts`（bootstrap 挂载新 DDL，沿用 advisory lock 模式）

DDL（对齐 doc 04 §1/§2 约束；全部 `IF NOT EXISTS` 幂等迁移）：

- `focus_sessions`: `id uuid PK default gen_random_uuid()`, `user_id uuid NOT NULL REFERENCES users(id)`, `installation_id text`, `activity text NOT NULL`, `planned_seconds int NOT NULL`, `status text NOT NULL CHECK (status IN ('active','paused','completed','abandoned'))`, `started_at timestamptz NOT NULL`, `ended_at timestamptz`, `effective_seconds int NOT NULL DEFAULT 0`, `pauses jsonb NOT NULL DEFAULT '[]'`, `client_request_id text NOT NULL`, `rule_version int NOT NULL DEFAULT 1`, `created_at/updated_at`; **UNIQUE(user_id, client_request_id)**；CHECK (planned_seconds BETWEEN 300 AND 10800)
- `idempotency_keys`: `key text`, `user_id uuid`, `endpoint text`, `response_body jsonb`, `status_code int`, `created_at`; **UNIQUE(key, user_id, endpoint)** —— 通用完成/变更幂等层
- `skins`: `id uuid PK`, `slug text UNIQUE NOT NULL`, `name text NOT NULL`, `access_type text NOT NULL DEFAULT 'free'`, `manifest_version int NOT NULL DEFAULT 1`, `moderation_status text NOT NULL DEFAULT 'approved'`, `published_at timestamptz`, `created_at`
- `skin_manifests`: `id uuid PK`, `skin_id uuid REFERENCES skins(id)`, `version int NOT NULL`, `manifest jsonb NOT NULL`, **UNIQUE(skin_id, version)**（版本只增不改，doc 04 §2）
- `user_skins`: `user_id`, `skin_id`, `source text NOT NULL DEFAULT 'free'`, `unlocked_at timestamptz`, `selected_at timestamptz`, **UNIQUE(user_id, skin_id)**
- `achievement_grants`: `id uuid PK`, `user_id`, `rule_key text NOT NULL`, `rule_version int NOT NULL DEFAULT 1`, `source_session_id uuid REFERENCES focus_sessions(id)`, `granted_at timestamptz NOT NULL DEFAULT now()`; **UNIQUE(user_id, rule_key, rule_version)**（同一成就不重复发放）
- `room_items`: `id uuid PK`, `item_id text UNIQUE NOT NULL`, `name text NOT NULL`, `source_rule_key text NOT NULL`
- `user_room_items`: `user_id`, `room_item_id`, `source_grant_id`, `unlocked_at`, **UNIQUE(user_id, room_item_id)**
- 种子（bootstrap 幂等 upsert）：4 个 room_items；3 套免费皮肤（`rainy-study-room` 真实 manifest JSON 与客户端 `rainyStudyRoom.ts` 同构；`sunny-classroom`/`midnight-workstation` 占位 manifest 同 schema，moderation_status='pending_assets'）

- [ ] Step 1: 失败测试（真库）：DDL 幂等（连续两次 bootstrap 不炸）；UNIQUE 约束生效（重复 client_request_id/重复 grant 各抛唯一冲突）；种子就位（3 皮肤/4 物件）
- [ ] Step 2: 实现；`npm test` 全绿
- [ ] Step 3: Commit `feat(server): focus/skins/achievements 域 schema 与幂等约束`

### Task 2: 皮肤 API（版本化 manifest）

**Files:** `server/src/features/skins/…` + `src/app/api/v1/skins/route.ts`、`[id]/manifest/route.ts`

- `GET /api/v1/skins` → 免费已发布皮肤列表（id/slug/name/accessType/manifestVersion/preview）
- `GET /api/v1/skins/{id}/manifest` → 当前版本 manifest JSON（与客户端 `SkinManifest` 类型同构，poster 用 URL 占位字段——客户端 P0-B 仍用本地 require 资产，字段预留 `posterUrl`）
- [ ] Step 1: 失败集成测试（真库 + 直接调 route handler 或模板既有测试入口模式）：列表只含 published；manifest 返回当前版本；未知 id 404 错误码 `SKIN_NOT_ENTITLED` 族（用 doc 04 §5 的 code/messageKey/traceId 结构）
- [ ] Step 2: 实现；Commit `feat(server): 皮肤列表与版本化 manifest API`

### Task 3: Focus API（幂等创建/结算/历史）

**Files:** `server/src/features/focus/…` + `src/app/api/v1/focus/…` route handlers（doc 04 §3 子集：`POST /focus/sessions`、`GET /focus/sessions/active`、`POST /focus/sessions/{id}/complete`、`POST /focus/sessions/{id}/abandon`、`GET /focus/history`、`GET /focus/weekly-summary`）

服务端结算规则（doc 03 §5，全部服务端校验，不信客户端总分钟）：
1. 创建：JWT 用户 + `clientRequestId` 幂等（重放返回既有会话，200 非 500）；同一用户至多一个 active|paused（否则 `ACTIVE_SESSION_EXISTS`）；planned 5–180min 校验
2. 完成：请求体 = 完整会话事件（startedAt/pauses[]/completedAt，客户端只上传可校验事件，doc 04 §3）；服务端重算 effectiveSeconds（同一套区间数学，从客户端 domain 移植为 server 端纯函数 + 单测）；校验区间不重叠/不倒序、planned 范围、时钟偏差（startedAt 距 now > 24h 拒绝 `SESSION_INTERVAL_INVALID`）；`Idempotency-Key` 写 `idempotency_keys`（重放直接返回首次响应体）；结算事务同写成就评估（Task 4 接线点，先留 hook）
3. abandon：保留实际分钟、`counted=false` 语义（榜单 P0-C 才用）
4. history/weekly-summary：服务端版 `summarize`（周一界 UTC+8，与客户端同口径）

- [ ] Step 1: 失败集成测试：**核心验收——同一 complete 请求重放 10 次仅一次结算（effective_seconds/账本只写一次）**；clientRequestId 重放；双 active 拒绝；区间倒序拒绝；历史/周汇总口径
- [ ] Step 2: 实现；Commit `feat(server): Focus API——幂等创建、服务端结算、历史与周汇总`

### Task 4: 服务端成就结算 + 房间收藏物

**Files:** `server/src/features/achievements/domain/rules.ts`（移植客户端 `rules.ts`，同 ruleVersion 1 同测试集）+ `data/` + 结算 hook 接线 + `src/app/api/v1/achievements/route.ts`、`me/achievements/route.ts`、`me/room/route.ts`

- 完成事务内：`evaluateGrants(completedHistory, alreadyGranted, now)` → 插 grant（UNIQUE 兜底 ON CONFLICT DO NOTHING）→ 插 user_room_items
- `GET me/achievements` → defs + 已获得；`GET me/room` → 物件 + 来源
- [ ] Step 1: 移植规则 + 测试（与客户端同断言集）；失败集成测试：**重放 complete 十次只发放一次成就**；首成→bookmark 物件
- [ ] Step 2: 实现 + 接线 Task 3 hook；Commit `feat(server): 服务端成就结算与房间收藏物（ruleVersion 1）`

### Task 5: 游客记录迁移（登录后一次）

**Files:** `server/src/features/focus/data/migrate.ts` + `src/app/api/v1/sync/migrate/route.ts`

- `POST /sync/migrate` body: `{ installationId, sessions: FocusSessionDoc[] }`（登录后客户端一次性推送本地历史）；服务端逐条按 `user_id+client_request_id` 幂等插入（已存在跳过），成就统一重评估一次；响应 `{ migrated, skipped }`；**重复调用零副作用**（第二次 migrated=0）
- [ ] Step 1: 失败集成测试：迁移 10 条 → 成就一次；**同一批重放 → migrated=0, skipped=10, 无新 grant**；与在线会话 clientRequestId 撞 → 跳过
- [ ] Step 2: 实现；Commit `feat(server): 游客记录一次性迁移（clientRequestId 幂等去重）`

### Task 6: 客户端 SyncEngine + 登录迁移接线

**Files:** `react-native/src/features/sync/{domain,syncEngine.ts,application,SyncProvider.tsx}` + `FocusStore`/设置页轻接线 + `src/__tests__/sync.test.ts`（真 dev server 集成，仿 apiClient.test.ts 模式）

- SyncEngine（纯逻辑 node 可测）：状态 `idle|syncing|synced|offline|error`；本地完成入队 → 登录态下自动 `POST /focus/sessions/{id}/complete`（Idempotency-Key=clientRequestId）；未登录累积本地（P0-A 行为完全不变）；登录成功事件触发 `POST /sync/migrate`（一次，标记 `lofi.sync.migratedAt`，失败可重试）
- UI：设置页「同步」行（状态 + 手动重试）；完成页不阻塞（正在同步徽标，doc 08 S06 规则）
- apiClient 扩展：focus/skins/achievements/sync 端点封装（沿用既有错误模型）
- [ ] Step 1: domain 纯测试（队列/重试/一次性迁移标记）→ 集成测试（起 dev server + 真库：注册→迁移→完成→服务端成就可见；断线→本地累积→恢复→补同步）
- [ ] Step 2: 实现 + UI 接线；模拟器走查：游客玩三轮 → 登录 → 记录/成就出现在账号（截图 evidence/p0b/）
- [ ] Step 3: Commit `feat(sync): 客户端同步引擎——离线队列、登录迁移一次、成就服务端一致`

### Task 7: P0-B 验收与交付记录

- [ ] Step 1: server `npm test` 全绿（含核心重放验收用例）；RN typecheck + vitest 全绿；模拟器走查 doc 06 §2 P0-B 验收语义
- [ ] Step 2: `docs/06` 追加 P0-B 验收记录（重放十次结果、迁移幂等结果、证据路径、已知偏离：CDN/对象存储预留、皮肤资产仍本地内置）；Commit `docs: P0-B 验收记录`
- [ ] Step 3: 最终整体审查子代理（本计划 vs 交付 + doc 04 错误码/幂等约束逐条核对）→ 向用户交付

---

## Self-Review 记录

1. **Spec 覆盖**：doc 06 §2 P0-B 四条 → Task 1-4（API+schema+结算账本）、Task 2（三套皮肤+版本 manifest）、Task 5+6（迁移一次不重复结算）；P0-B 验收句 → Task 3/4 重放用例。榜单/小组明确划出（P0-C）。
2. **占位符**：无 TBD；schema 列级 DDL、结算规则、测试断言清单全部落字；实现细节指向模板既有模式（database.ts/auth.ts/tests）。
3. **类型一致性**：客户端 `FocusSessionDoc` ↔ 服务端会话事件 ↔ `focus_sessions` 列；`SkinManifest` 同构；`ruleVersion 1` 三端一致；错误码沿用 doc 04 §5 枚举。
