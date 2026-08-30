# P0-C 排行与小组 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付 doc 06 §2 P0-C：好友邀请与好友周榜、隐私设置（可退出）、私密自习小组（共同目标/在线专注）、每日 180 分钟计入上限、周快照与周结算收藏物。验收：退出榜单后不可在好友查询中出现；任务正文从不进入榜单响应和日志。

**决策（2026-08-30，补记 doc 06 §7）：好友关系来源 = 邀请码制。** 用户生成加入码，他人兑码即建立双向好友关系；小组同样用加入码。无通讯录权限、无二维码依赖（二维码为 P1 展示层增强）。

**Architecture:** 榜单分从 `focus_sessions` 账本派生（`rule_version=2`：每日计入上限 180 分钟，服务端结算），原子 upsert 进 `leaderboard_scores`；查询走授权层（好友/小组成员 + 未退出），响应只含昵称/头像/分钟/名次。周快照 `leaderboard_snapshots` 不可变（周末后首次查询惰性结算，幂等）。小组共同目标 = 周目标分钟，成员贡献来自同一账本；在线专注人数 = 活跃会话计数。

**Tech Stack:** 同 P0-B（Next.js route handlers + PostgreSQL + node:test 真库集成测试；客户端 Expo RN）。

**规范真源：**
- 实体/约束/路由/周格式（`YYYY-Www` ISO 周）：`docs/04-DATA-AND-API.md` §1/§2/§3
- 一致性：`docs/03-ARCHITECTURE.md` §9（原子增量、可重建、授权在查询层、任务正文不入榜单、不可变快照、补计规则）
- 产品规则：`docs/01-PRD.md` §5.7（只算完成且通过校验的专注、每日 180 分钟上限、中途退出不计、展示昵称/头像/分钟/名次、可关闭公开昵称或退出、小组共同目标/贡献/在线人数、无陌生人聊天）
- 逐屏：`docs/08-SCREEN-SPECIFICATIONS.md` §10（S10 榜单）、§11（S11 小组）、§12（S12 规则与隐私）、§13（S13 周结算）

**明确不在 P0-C（防 creep）：** 全国总榜、陌生人聊天、组内挑战玩法、二维码 UI、周结算补计的复杂策略（延迟同步按「计入当前周」简单规则，ruleVersion 记录语义）、通知推送。

---

### Task 1: 排行/小组域 schema + 好友/小组 API

**Files:** `server/src/server/database-schema-lofi.ts`（追加 DDL + 无需种子）+ `server/src/features/leaderboards/data/`、`server/src/features/leaderboards/presentation` 不需要（server 无 presentation）→ 路由 `src/app/api/v1/friends/…`、`src/app/api/v1/study-groups/…`

DDL：
- `friend_invitations`: `id TEXT PK`, `user_id TEXT UNIQUE REFERENCES users(id)`（每人一个有效码）, `code TEXT UNIQUE NOT NULL`（8 位可读码）, `created_at`
- `friendships`: `id TEXT PK`, `user_id`, `friend_id`, `created_at`, `UNIQUE(user_id, friend_id), CHECK (user_id < friend_id)`? —— 双向确认存单行会引入排序复杂度；**存两行**（A→B 与 B→A 同事务写入），查询简单：`UNIQUE(user_id, friend_id)`
- `study_groups`: `id TEXT PK`, `name TEXT NOT NULL`, `owner_user_id REFERENCES users(id)`, `join_code TEXT UNIQUE NOT NULL`, `weekly_goal_minutes INTEGER NOT NULL DEFAULT 600`, `created_at`
- `group_members`: `group_id`, `user_id`, `role TEXT NOT NULL DEFAULT 'member'`, `joined_at`, `UNIQUE(group_id, user_id)`
- `leaderboard_scores`: `user_id`, `scope_type TEXT CHECK IN ('friends','group')`, `scope_id TEXT NOT NULL`（friends 榜 scope_id=user_id 本人的好友圈聚合键；group 榜=group_id）, `week_id TEXT NOT NULL`（`YYYY-Www`）, `effective_seconds INTEGER NOT NULL DEFAULT 0`, `session_count INTEGER NOT NULL DEFAULT 0`, `rule_version INTEGER NOT NULL DEFAULT 2`, `updated_at`, `PRIMARY KEY(user_id, scope_type, scope_id, week_id, rule_version)`
- `leaderboard_snapshots`: `id TEXT PK`, `scope_type`, `scope_id`, `week_id`, `rankings TEXT NOT NULL`（JSON 数组：nickname/avatar/minutes/rank，**不含任务正文**）, `settled_at`, `rule_version`, `UNIQUE(scope_type, scope_id, week_id, rule_version)`
- `leaderboard_settings`: `user_id TEXT PK REFERENCES users(id)`, `public_display INTEGER NOT NULL DEFAULT 1`, `opted_out INTEGER NOT NULL DEFAULT 0`, `updated_at`

好友 API（requireAuth）：
- `POST /friends/invitations` → `{ code }`（无则生成；幂等）
- `POST /friends/invitations/accept` body `{ code }` → 兑码建立双向好友（自兑/重复兑幂等或明确错误码 `FRIEND_INVITATION_INVALID`）
- `GET /friends` → 好友列表（昵称/头像 + 本周分钟）

小组 API：
- `POST /study-groups` body `{ name, weeklyGoalMinutes? }` → 建组（owner 自动入组）
- `POST /study-groups/join` body `{ code }` → 入组（幂等重复加入返回已加入）
- `GET /study-groups/{id}` → 组信息 + 成员列表 + 共同目标进度 + 在线专注人数（活跃会话成员计数）

- [ ] Step 1: 失败测试 `tests/leaderboard-schema.test.ts`：约束（邀请码唯一、好友双向两行、PK 冲突）+ 好友/建组/入组服务函数
- [ ] Step 2: 实现；`npm test` 全绿；Commit `feat(server): 好友邀请码/小组/榜单分 schema 与好友小组 API`

### Task 2: 榜单结算与查询（每日上限 + 隐私 + 快照）

**Files:** `server/src/features/leaderboards/domain/settlement.ts`（纯：周 id、每日上限裁剪、聚合）+ `data/score-repository.ts` + 路由 `src/app/api/v1/leaderboards/friends/route.ts`、`groups/[id]/route.ts`、`me/leaderboard-privacy/route.ts`（GET/PATCH）

规则（ruleVersion 2）：
- `weekIdOf(ms)` → ISO `YYYY-Www`（周一界，UTC+8 与既有口径一致）
- 结算：从 `focus_sessions` 取该周 completed 会话 → **每日分钟数裁剪到 180** → 求和 → upsert `leaderboard_scores`（原子 ON CONFLICT DO UPDATE）
- 查询 `GET /leaderboards/friends?week=`：本人 + 好友（排除 `opted_out=1`；`public_display=0` 的好友**仍参与排名但昵称显示「已隐藏」头像 null**——docs/01「关闭公开昵称」语义）→ 排名数组 `{ userId, nickname, avatarUrl, minutes, sessionCount, rank }`，**无任务正文/活动字段**
- 周末后首次查询：惰性 `settleWeek(scope, weekId)` → 写不可变快照；已有快照直接返回快照
- `GET/PATCH /me/leaderboard-privacy`：`{ publicDisplay, optedOut }`；optedOut 后本人从所有榜单查询消失（含本人视图提示「已退出榜单」）

- [ ] Step 1: 失败测试 `tests/leaderboard.test.ts`：每日 180 分钟裁剪（一天 300 分钟 → 计 180）；跨两天合计；weekId 边界（周日/周一）；optedOut 好友从查询消失；publicDisplay=0 昵称隐藏但保留名次；**响应无任务正文字段**；快照幂等（二次结算不覆盖）；周末前不生成快照
- [ ] Step 2: 实现；`npm test` 全绿；Commit `feat(server): 好友周榜——每日上限结算、隐私授权、不可变快照`

### Task 3: 小组榜单与周结算收藏物

**Files:** 扩展 Task 2 的 scope 处理（scope_type='group'）+ 组周目标结算 → 房间收藏物 `weekly_group_photo`

- 组周榜 = 成员聚合榜（同 privacy 语义：optedOut 成员不计入显示）
- 周结算：周末后惰性结算时，若组有效分钟 ≥ `weekly_goal_minutes` → 每位（当时在组）成员发 `weekly_group_photo` 房间收藏物（`room_items` 增种子，ON CONFLICT 幂等；来源记 `weekly_settlement`）
- `GET /study-groups/{id}` 返回补充：本周组贡献分钟/目标进度/是否已结算

- [ ] Step 1: 失败测试：组榜授权（非成员 403）；目标达成发收藏物（每成员一次）；快照后重复结算不改收藏物
- [ ] Step 2: 实现；Commit `feat(server): 小组周榜与周结算收藏物（weekly_group_photo）`

### Task 4: 客户端——真实榜单/小组/隐私/周结算屏

**Files:** `react-native/src/features/leaderboards/{data,application,presentation}/` + `routes.ts`/`RootNavigator.tsx`（`leaderboard.rules`、`groups.detail`、`weekly.settlement` 新路由；`leaderboard.home` 从登录壳换真实屏，未登录仍显示登录壳）

- S10 榜单（doc 08 §10）：分段「好友/小组」（本周为固定上下文）；行 76 高（名次圆片旧金/雾银/木铜、头像 44、分钟右对齐 tabular）；当前用户卡固定底部（achievement 低透明边框）；规则提示行「仅展示完成的专注」；隐私入口 → S12
- S11 小组（§11）：房间背景 + 成员头像 44（≤6 + "+N"）+ 在线点「N 人正在专注」+ 共同目标卡（进度）+ 我的贡献 + 「开始一起学习」→ focus.setup
- S12 规则与隐私（§12）：三条规则行（44dp SVG 图标）+ 公开昵称 Switch（系统可访问）+ 退出榜单 Switch（二次确认 Confirm）
- S13 周结算（§13）：房间媒体 58% + 结果 sheet（名次/共同分钟/奖励收藏物）+ 「查看房间」「下周继续」；名次下降只陈述不羞耻
- 未登录：保留现有登录壳

- [ ] Step 1: data/application/presentation + 路由；typecheck 0；RN 门禁测试绿
- [ ] Step 2: Metro 打包冒烟；Commit `feat(screens): 好友周榜/小组/隐私/周结算四屏`

### Task 5: P0-C 验收与交付记录

- [ ] Step 1: server 全量测试双跑全绿；RN 门禁全绿
- [ ] Step 2: 真实 HTTP 验收脚本（沿用 P0-B 模式）：双账号互加好友 → 各自完成会话（一天超 180 分钟场景）→ 好友榜查询（裁剪/排名/隐藏昵称）→ 退出榜单后从好友查询消失（**P0-C 验收句**）→ 响应体断言无任务正文字段 → 建组/入组/组榜/目标达成收藏物
- [ ] Step 3: 模拟器走查（登录账号 → 榜单/小组/隐私屏截图）evidence/p0c/
- [ ] Step 4: `docs/06` §10 P0-B 后追加 P0-C 验收记录（含 §7 好友来源决策补记）；Commit `docs: P0-C 验收记录`
- [ ] Step 5: 向用户交付演示与下一阶段（P1-A 收费）建议

---

## Self-Review 记录

1. **Spec 覆盖**：doc 06 §2 P0-C 五条 → Task 1（好友邀请/隐私/小组 schema+API）、Task 2（好友周榜+每日上限+隐私）、Task 3（小组榜+周快照+结算收藏物）、Task 4（四屏）；验收句 → Task 2/5（optedOut 消失、响应无正文）。榜单 rubric 语义用 ruleVersion=2 与 P0-B 的 1 并存。
2. **占位符**：DDL 列级、路由签名、断言清单全落字；实现细节指向 P0-B 已建立的服务端模式（repository/route/真库测试）。
3. **类型一致性**：`weekIdOf` 全域唯一实现；`scope_type` 二值枚举贯穿 schema/结算/查询/快照；房间收藏物复用 P0-B 的 room_items/user_room_items 机制。
