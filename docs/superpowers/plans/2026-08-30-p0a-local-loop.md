# P0-A 本地可验证闭环 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `loficompanion/react-native` 中交付 P0-A：游客可选皮肤、可完成专注闭环（创建/开始/暂停/喝水/继续/完成/强杀恢复）、本地历史+成就+房间，全部离线可用，通过 doc 06 P0-A 验收。

**Architecture:** 分层遵从 doc 03 §4：`features/<域>/domain`（纯 TS，node 可测）→ `application`（React store/编排）→ `data`（AsyncStorage 仓储，driver 可注入）→ `presentation`（屏幕/组件）。皮肤与事件状态机按 doc 03 §6；P0-A 资产为纯静态海报（已决策），播放器按 manifest 完整路径实现，poster 即降级路径。计时为时间戳推导（doc 03 §5），不依赖前台秒数。

**Tech Stack:** Expo RN 0.86 / React 19、react-navigation v7（模板自管栈 + 自定义胶囊 TabBar）、AsyncStorage、expo-video（P0-A 仅 poster 用 Image）、vitest（node 环境，仅 `.test.ts`）。

**规范真源（实现者必读，均在仓库内）：**
- 令牌/字级/动效：`docs/07-VISUAL-DESIGN-SYSTEM.md`（§4 颜色、§6 字级、§7 间距圆角、§8 图标、§10 动效）
- 逐屏规格：`docs/08-SCREEN-SPECIFICATIONS.md`（每个屏幕的实现规格以该文件对应小节为准）
- 验收：`docs/06-DELIVERY-AND-ACCEPTANCE.md` §2 P0-A、§3 旅程、§4 门禁；`docs/09-VISUAL-ACCEPTANCE.md`
- 事件表：`docs/01-PRD.md` §5.4（优先级/冷却）

**模板事实（已侦察核实）：**
- 导航：`src/navigation/RootNavigator.tsx`（native-stack，headerShown:false，每屏自带 AppHeader）；`PrimaryTabs.tsx` 为自定义 2-tab 胶囊（`replace()` 切换）；路由名全集在 `routes.ts:AppRoute`。
- 状态：`src/state/AppStore.tsx` 提供 `useApp()`（push/replace/back、bootstrap、pendingRoute，见 `AppStore.tsx:206` 登录落地 `pendingRoute ?? 'home'`）。
- 主题：`src/theme/tokens.ts`（colors/darkColors/spacing/radii）+ `styles.ts`；`PreferencesProvider` 提供 `palette`。模板红 brand `#A84444` 将被 doc-07 夜色令牌替换。
- 持久化：`src/data/storage.ts`（AsyncStorage + SecureStore 模式）。
- 测试：`vitest.config.ts` node 环境、仅 `src/**/*.test.ts`；RN/组件不可进 node 测试——**所有 domain 代码必须零 RN import**（模式参照 `src/data/apiClient.ts` 平台注入）。
- 现有 screens 全部保留可用；新功能屏放 `src/features/<域>/presentation/`。

**交付目标：** iOS 模拟器（已确认本机有 iPhone 16/17 Pro）经 `expo run:ios` 或 dev client 运行；`npm run typecheck` + vitest 全绿为每任务门禁。

**明确不在 P0-A（防止 scope creep）：** 服务端同步、登录/排行真实数据（排行 tab 用登录引导壳）、AI 定制、支付、环境音轨（manifest 预留字段，`audioUrl: null`）、视频循环（poster 即资产）、Flutter/ArkTS 端。

---

### Task 1: 设计令牌替换（doc-07 夜色主题）

**Files:**
- Modify: `react-native/src/theme/tokens.ts`（重写值，保留导出名）
- Modify: `react-native/src/theme/styles.ts`（如引用具体色值则同步）
- Test: `react-native/src/theme/tokens.test.ts`（新增）

要求：`colors`/`darkColors` 的键集合**不变**（全部现有屏编译通过），值替换为 doc 07 §4 语义映射（`background`=night.900 `#091522`、`surface`=night.850 `#0D1B2B`、`text`=paper.100 `#F3EFE7`、`textSecondary`=mist.300 `#B4BECA`、`border`=borderSoft、`brand`=rain.500 `#4F8FE8`、`brandPressed`=`#3E79C9`、`brandSoft`=rain 低透明、`success`=leaf.500、`warning`=warning.500、`error`=danger.500、`scrim`=scrimBottom）。新增导出：`primitives`（doc 07 §4.1 全表）、`semantic`（§4.2 全表，含 canvasDeep/surfaceRaised/surfaceInset/actionFocus/achievement/borderStandard/borderEmphasis/scrimTop）、`type` 字级表（§6.2：displayTimer 56/64 … micro 11/15，RN `fontSize`/`lineHeight`/`fontWeight`）、`space` 别名对齐 §7.1（含 x10/x12）、`radii` 校准为 8/12/16/24/999。`darkColors` 与 `colors` 相同（产品强制暗色）；PreferencesProvider 外观切换保持可用但两套值一致。

- [ ] Step 1: 写失败测试：tokens 十六进制值逐一断言 = doc 07 §4.1 表；`semantic.actionPrimary === '#4F8FE8'`；`type.displayTimer.fontSize === 56`；运行 `npx vitest run src/theme/tokens.test.ts` → FAIL
- [ ] Step 2: 重写 `tokens.ts`（键集合不变 + 新导出）；`radii.small` 10→8
- [ ] Step 3: `npx vitest run src/theme/tokens.test.ts` → PASS；`npm run typecheck` → 0 错；`npx vitest run`（全量 payment 套件）→ PASS
- [ ] Step 4: Commit `feat(theme): doc-07 夜色设计令牌——原语/语义/字级/间距，模板色全部替换`

### Task 2: 皮肤域（manifest 类型 + 内置皮肤 + 解析器）

**Files:**
- Create: `react-native/src/features/skins/domain/types.ts`、`rainyStudyRoom.ts`、`resolve.ts`
- Test: `react-native/src/features/skins/domain/skins.test.ts`

类型（对齐 doc 04）：`SkinStateAsset { state: CompanionState; poster: number; focalPointX: number; focalPointY: number; loopUrl?: string; durationMs: number }`（poster 为 `require()` 模块引用；P0-A `loopUrl` 恒 absent）；`SkinEventMapping { eventType; stateAssetIndex? ; priority; interruptible; cooldownSeconds; returnState }`；`SkinManifest { id; slug; name; accessType: 'free'; themeTokens; states: SkinStateAsset[]; eventMappings: SkinEventMapping[]; defaultState; manifestVersion }`。`CompanionState = 'ready'|'focusing'|'paused'|'drinking'|'resting'|'completed'`；`CompanionEventType = 'session.ready'|'focus.started'|'focus.loop'|'wellness.drink'|'focus.paused'|'break.started'|'focus.resumed'|'focus.completed'`（doc 01 §5.4 八事件，优先级 60/80/10/70/90/80/90/100）。`rainyStudyRoom.ts` 导出内置 manifest：6 状态齐全、drinking 冷却 60s、eventMappings 覆盖 8 事件、poster 占位指向 Task 11 资产路径、`focalPointX: 0.5, focalPointY: 0.38`。`resolve.ts`：`stateAsset(manifest, state)`（缺失回退 `defaultState` 资产，永不返回 undefined）、`mappingFor(manifest, eventType)`。

- [ ] Step 1: 失败测试：6 状态 each `stateAsset()` 非空；drink 冷却 60000；`focus.completed` 优先级 100；缺状态回退 default；`mappingFor('wellness.drink').cooldownSeconds > 0`
- [ ] Step 2: 实现；`npx vitest run src/features/skins/domain/skins.test.ts` PASS；typecheck PASS
- [ ] Step 3: Commit `feat(skins): 皮肤域——manifest 类型、雨夜书房内置清单、状态/事件解析`

### Task 3: 专注计时域（时间戳推导 + 强杀恢复）

**Files:**
- Create: `react-native/src/features/focus/domain/types.ts`、`engine.ts`、`validate.ts`
- Test: `react-native/src/features/focus/domain/focus.test.ts`

类型：`ActivityType = 'homework'|'reading'|'coding'|'vocab'|'free'`；`FocusSessionDoc { id; clientRequestId; activity; plannedSeconds; status: 'active'|'paused'|'completed'|'abandoned'; startedAtUtc: number; pauses: {start:number; end:number}[]; completedAtUtc?: number; abandonedAtUtc?: number; docVersion: 1 }`（persisted 形态，时间全 UTC ms）。`engine.ts` 纯函数：`effectiveSeconds(doc, now)`（=`⌊(min(now,end)-startedAt-Σpauses)/1000⌋`，活动会话 end=now）；`remainingSeconds(doc, now)`；`pauseSession(doc, now)` / `resumeSession(doc, now)`（校验状态，重复 pause 幂等返回原文档）；`completeSession(doc, now)`；`abandonSession(doc, now)`；`deriveOnLaunch(doc, now)`——强杀恢复唯一入口：按时间戳重算 active/paused、若 `now-startedAt>=planned*1000+Σpauses` 自动 complete（补 `completedAtUtc=startedAt+planned+Σpauses`，误差<1s）。`validate.ts`：`validateCustomDuration(min)` → 5–180（doc 08 S03）；`validateSessionInput`。

- [ ] Step 1: 失败测试（关键性质）：暂停区间数学；重复 pause/resume 幂等；completed 后再操作返回原文档；**强杀恢复**：构造 startedAt=T、pause 120s、冻结 1000s 后 `deriveOnLaunch` effectiveSeconds 误差 ≤1s；跨计划时长自动 complete 且 completedAtUtc 精确；自定义时长边界 4/5/180/181
- [ ] Step 2: 实现；vitest PASS（本文件为全计划最重的正确性测试，≥15 断言）；typecheck PASS
- [ ] Step 3: Commit `feat(focus): 计时域——区间推导、幂等操作、强杀恢复、输入校验`

### Task 4: 陪伴状态机（优先级/冷却/返回态）

**Files:**
- Create: `react-native/src/features/companion/domain/stateMachine.ts`
- Test: `react-native/src/features/companion/domain/companion.test.ts`

纯 reducer：`CompanionRuntimeState { state: CompanionState; playingEvent: { eventType; startedAt; durationMs } | null; lastFiredAt: Map<eventType, number>; queue: QueuedEvent[] }`。`dispatch(state, event, ctx{now, manifest, reducedMotion})` 规则（doc 01 §5.4 + doc 03 §6）：事件映射到目标状态；`playingEvent` 存在时——新事件 priority 更高且当前可打断 → 立即替换；否则入队（队列按 priority，容量 3）；**过期不补播**：出队时 `now - queuedAt > 10_000` 丢弃；**冷却**：同 eventType 在 cooldownSeconds 内 → 忽略（`wellness.drink` 60s）；动作播放 `durationMs`（静态=4000ms 演示时长，reducedMotion=1000ms）后自动回 `returnState`；`focus.completed` 打断一切。输出为 `(state, effects[])`，effects 仅描述（`showBanner`/`swapPoster(state)`/`autoReturn(afterMs)`），由 application 层执行——保持 node 可测。

- [ ] Step 1: 失败测试：drink → drinking → 自动回 focusing；drinking 中 focus.completed（100>70）打断；drinking 中 60s 内二次 drink 被冷却忽略；队列入队/过期丢弃；reducedMotion duration 缩短；`focus.paused` 期间 drink 入队、resume 后先播 drinking 再回 paused（returnState 语义）
- [ ] Step 2: 实现；vitest PASS；typecheck PASS
- [ ] Step 3: Commit `feat(companion): 状态机——优先级打断、冷却、过期丢弃、返回态、减少动态`

### Task 5: 成就域 + 房间收藏物

**Files:**
- Create: `react-native/src/features/achievements/domain/rules.ts`
- Test: `react-native/src/features/achievements/domain/achievements.test.ts`

`AchievementRuleKey = 'first_focus'|'streak_7'|'rainy_10h'|'sessions_100'`；`ACHIEVEMENT_DEFS`（ruleVersion:1，含 name/条件描述/rewardItemId：first_focus→bookmark、streak_7→lamp、rainy_10h→plant、sessions_100→group_photo，对齐 doc 01 §5.6 与 achievements.png）。纯函数 `evaluateGrants(history: CompletedSession[], alreadyGranted: AchievementRuleKey[], now): Grant[]`——`first_focus`（≥1 完成）、`streak_7`（连续 7 自然日各 ≥1 完成，Asia/Shanghai 日界）、`rainy_10h`（累计 effectiveSeconds≥36000）、`sessions_100`；同一 ruleKey 只发一次（调用方已含 alreadyGranted 仍需防御）。奖励映射 `rewardFor(ruleKey): RoomItemId`。

- [ ] Step 1: 失败测试：四规则各触发/不触发边界（10h=35999s 不发；断连重置 streak；跨周界 streak）；重复调用不重复发
- [ ] Step 2: 实现；vitest PASS
- [ ] Step 3: Commit `feat(achievements): 成就规则与房间收藏物映射（ruleVersion 1）`

### Task 6: 本地仓储（AsyncStorage，driver 注入）

**Files:**
- Create: `react-native/src/features/focus/data/focusRepository.ts`、`react-native/src/features/achievements/data/achievementRepository.ts`、`react-native/src/features/skins/data/skinSelectionRepository.ts`
- Test: `react-native/src/features/focus/data/focusRepository.test.ts`

`StorageDriver { get(key): Promise<string|null>; set(key, value): Promise<void>; remove(key): Promise<void> }`（结构匹配 AsyncStorage 静态方法，构造注入；node 测试用 in-memory Map 实现）。键：`lofi.focus.active`（单活动会话 doc）、`lofi.focus.history`（完成/放弃 doc 数组，append-only）、`lofi.achievements.granted`、`lofi.skin.selected`、`lofi.room.items`。`focusRepository`：`saveActive/loadActive/clearActive/appendHistory/loadHistory`；查询纯函数 `summarize(history, now)`：`{ todayMinutes, todaySessions, weekMinutes, weekTargetMinutes(默认300), streakDays, byActivity }`（周界周一 00:00 Asia/Shanghai——用注入 `dayBoundaryOffsetMinutes: 480` 计算，不依赖设备 TZ）。achievement/skin/room repository 为薄 CRUD。

- [ ] Step 1: 失败测试：driver 注入存取；active→history 流转；`summarize` 今日/本周/科目分布/streak（含周界跨天用例）；坏 JSON 容错返回空
- [ ] Step 2: 实现；vitest PASS；typecheck PASS
- [ ] Step 3: Commit `feat(data): 本地仓储——活动会话/历史/成就/皮肤选择/房间，driver 注入可测`

### Task 7: application 层——FocusStore + 生命周期接线

**Files:**
- Create: `react-native/src/features/focus/application/FocusStore.tsx`
- Modify: `react-native/src/state/AppStore.tsx`（仅：`'home'` 路由渲染改指 FocusHomeScreen，见 Task 9；bootstrap 不动）
- Test: `react-native/src/features/focus/application/focusStore.test.ts`（可测部分：selectors、与 domain 组合的恢复推导）

`FocusProvider`（挂 App.tsx 最外层内）：暴露 `{ activeSession, today, week, skin, companion, actions: { startSession, pause, resume, drink, complete, abandon, selectSkin, tick } }`。职责：启动时 `loadActive → deriveOnLaunch`（强杀恢复）；`AppState` 监听 background→foreground 时重推导（不累加前台秒）；每秒 `tick`（仅驱动显示，时长一律时间戳推导）；`drink` 调 companion dispatch 并执行 effects（banner 显隐、poster 切换、autoReturn setTimeout、冷却提示）；完成时写 history + 触发 `evaluateGrants` 存入 achievementRepository + 刷新 summaries。reduced motion 读取系统 `AccessibilityInfo.isReduceMotionEnabled`。

- [ ] Step 1: 写可 node 测的 selector/组合测试（tick 不改变 effectiveSeconds；background 1h 后前台 deriveOnLaunch 补完成）
- [ ] Step 2: 实现 store；typecheck PASS；vitest PASS
- [ ] Step 3: Commit `feat(focus): FocusStore——生命周期推导、事件编排、成就结算接线`

### Task 8: 设计系统组件（doc 07 §7/8/10/11）

**Files:**
- Create: `react-native/src/features/skins/presentation/ImmersiveMediaSurface.tsx`、`react-native/src/design-system/FocusTimerRing.tsx`、`FocusActionBar.tsx`、`SkinPreviewCard.tsx`、`StudyResultSheet.tsx`、`AchievementTile.tsx`、`WeeklyProgressCard.tsx`
- Modify: `react-native/src/design-system/AppIcon.tsx`（新增图标：droplet、check-circle、bookmark、lamp、plant、group、trophy-free 版书签/台灯/书本组合、pause、play、stop、chevron）
- Create: `react-native/assets/fonts/`（Source Serif 4 Semibold `.ttf`，OFL 授权）+ `useTabularSerif` hook（expo-font；**若字体下载不可行**：退化为系统 serif + `fontVariant:['tabular-nums']`，记录偏离）

组件契约（几何/颜色/动效数值严格按 doc 07/08 引用小节）：
- `ImmersiveMediaSurface({ poster, focalPointX, focalPointY, nextPoster?, scrim })`：Image `cover` 裁切以焦点为中心（doc 07 §9.1/9.2）；顶部 136dp / 底部 260dp 渐变（`scrimTop/Bottom`）；poster 切换 150ms 交叉淡化（Animated opacity，仅 transform/opacity）；无 `nextPoster` 时不动画。
- `FocusTimerRing({ remainingSeconds, totalSeconds, size=196, strokeWidth=4 })`：SVG 圆环，底环 borderSoft、进度环 actionPrimary，中心 `type.displayTimer` tabular serif，`mm:ss`。
- `FocusActionBar({ items: {key,icon,label,onPress,variant:'primary-accent'|'neutral'}[] })`：紧凑 44 高、间距 8（doc 08 S04）；喝水 accent 雨蓝、结束中性。
- `SkinPreviewCard({ manifest, selected, onPress })`：358×128、圆角 16、底部 48dp 黑渐层名称、选中 2dp `actionFocus` 内描边 + 右上 28dp 勾（doc 08 S01）。
- `StudyResultSheet`、`AchievementTile`、`WeeklyProgressCard`：按 doc 08 S06/S07/S08 几何。
- 全部：SVG 图标 24×24 currentColor、accessibilityLabel、44×44 触控（doc 07 §8）。

- [ ] Step 1: 实现 + 每组件一个渲染参数 smoke 导出（组件文件默认导出列表供屏引用）；typecheck PASS
- [ ] Step 2: Commit `feat(design-system): 专注视觉组件——沉浸媒体面/计时环/动作栏/皮肤卡/结果单/成就块/周进度`

### Task 9: 核心屏 S01–S06 + 4-Tab 导航

**Files:**
- Create: `react-native/src/features/skins/presentation/SkinGalleryScreen.tsx`（S01）、`react-native/src/features/focus/presentation/FocusHomeScreen.tsx`（S02）、`FocusSetupSheet.tsx`（S03）、`FocusActiveScreen.tsx`（S04+S05）、`FocusCompleteScreen.tsx`（S06）
- Modify: `src/navigation/routes.ts`（新增 `skins.gallery|focus.setup|focus.active|focus.complete`）、`RootNavigator.tsx`（注册；`focus.active` 用 `presentation:'fullScreenModal'`，`focus.complete` 到达时 `replace`）、`PrimaryTabs.tsx`（2→4 tab：专注/成就/排行/我的，图标 droplet/bookmark/group/user，选中填充+雨蓝，路由 `home|achievements.home|leaderboard.home|profile.home`；`'home'` 组件替换为 FocusHomeScreen——模板旧 HomeScreen 移至 `home.legacy` 路由保留不删）

屏幕行为逐条对齐 doc 08 §2–§7（几何、弱化机制 5s→0.32/计时 0.82/160ms 恢复、冷却按钮说明、二次确认结束、完成页 pending→本地展示、无成就收起卡片）+ §21 反馈规范。S03 活动默认写作业·25min，时长分段 15/25/45/60 + 自定义校验（domain `validateCustomDuration`）。S04 后台/恢复经 FocusStore；喝水 banner（180ms 进/140ms 退，下移 8dp）+ 顶部 2dp 进度线。

- [ ] Step 1: 六屏 + 导航注册实现；typecheck PASS
- [ ] Step 2: Commit `feat(screens): 核心闭环六屏——皮肤选择/今日/创建/专注/事件/完成 + 4-Tab`
- [ ] Step 3: 模拟器自验（`npx expo run:ios --device` 或模拟器）：走完 doc 06 §3 旅程 1-7 步并截图附入报告

### Task 10: 成就/记录/房间/排行壳（S07–S10）

**Files:**
- Create: `react-native/src/features/achievements/presentation/AchievementsScreen.tsx`（S07）、`HistoryScreen.tsx`（S08）、`RoomScreen.tsx`（S09）、`react-native/src/features/leaderboards/presentation/LeaderboardSignInScreen.tsx`（S10 壳：登录引导 + 规则摘要，标注 P0-B 接入）
- Modify: `routes.ts`（`achievements.home|history.week|room.home|leaderboard.home`）、`RootNavigator.tsx`

S07：2×2 指标（displayMetric）+ 成就网格（解锁=房间物件图、锁定降饱和+SVG 锁）+ 空状态（不显示零值大卡）。S08：七日柱图（SVG，柱宽 10–14 圆角 3，缺日为 0）+ 科目分布 + 时间线。S09：房间 = 当前皮肤 poster + 已解锁收藏物热点（44×44）+ callout。排行壳：未登录状态 + 规则三条 + 「登录后同步」CTA → auth.signIn。

- [ ] Step 1: 实现四屏 + 注册；typecheck PASS
- [ ] Step 2: Commit `feat(screens): 成就/记录/房间/排行壳四屏`
- [ ] Step 3: 模拟器走查四屏空状态与有数据态，截图

### Task 11: 资产生产——雨夜书房六状态海报

**Files:**
- Create: `react-native/assets/skins/rainy-study-room/{ready,focusing,paused,drinking,resting,completed}.png`（1290×2796 或 ≥1170×2532，9:19.5）
- Modify: `rainyStudyRoom.ts` poster require 指向实际文件

生产路径（按序尝试，成功即停）：① jimeng-api img2img：以 `assets/prototypes/app-concept.png`（或 core-flow.png 第 2 屏裁切）为角色/房间一致性参考，生成 base=『雨夜书房 夜晚 固定镜头 少女伏案写字 台灯暖光 雨窗冷蓝 竖屏 9:19.5』，再以 base 为参考 img2img 派生其余 5 状态（drinking=举杯喝水、paused=停笔抬头、resting=伸懒腰、completed=抬头微笑、ready=坐正准备）；角色/服装/桌面/水杯位置必须一致（doc 07 §9.1：脸 44-58%/28-48%，水杯右侧固定）。② 失败则 gpt-image。③ 再失败：从 `core-flow.png` 裁切 2/3/4/5 屏 + 1 屏首图，标注为临时资产。验收：6 图入仓、manifest 引用编译通过、模拟器 S04 各状态切换 poster 正确、与原型并排无明显角色跳变（人工审）。

- [ ] Step 1: 生成/派生 6 图，视觉自查（同一角色/构图/灯光）
- [ ] Step 2: 入仓 + manifest 接线；模拟器切换走查
- [ ] Step 3: Commit `feat(assets): 雨夜书房六状态静态海报（P0-A 静态先行）`

### Task 12: P0-A 验收与交付记录

- [ ] Step 1: 全门禁：`npm run typecheck` 0 错；`npx vitest run`（payment 套件 + 新增全部 domain 测试）全绿
- [ ] Step 2: 模拟器验收（doc 06 §2 P0-A + §3 旅程，逐条录证）：①全新启动→选雨夜书房→写作业25min→开始 ②5s 弱化/触摸恢复 ③喝水→动作→自动回专注 ④暂停/继续 ⑤结束二次确认 ⑥完成页今日+本周+成就+房间收藏物 ⑦**强杀恢复**：`xcrun simctl terminate <udid> tech.zhongbei.loficompanion` 后重launch，剩余时间误差 ≤1s ⑧再完成两轮（15min 轮次可用自定义 5min 缩短验证逻辑）→ 连续三轮
- [ ] Step 3: 视觉抽查（doc 09 §4 P0 列表的可达状态子集）：S01 默认/选中、S02 空态/回访、S03 控制显隐/弱化/暂停、S05 事件三态、S06 无成就/新成就——模拟器 390×844 截图存 `docs/superpowers/evidence/p0a/`
- [ ] Step 4: 更新 `docs/06-DELIVERY-AND-ACCEPTANCE.md`：P0-A 验收记录（各条结果+证据路径+已知偏离：环境音/视频循环/视觉基线自动化 deferred）；Commit `docs: P0-A 验收记录`
- [ ] Step 5: 最终审查子代理（整体 diff vs 本计划 + doc 06 §4 门禁逐条核对）→ 向用户交付演示

---

## Self-Review 记录

1. **Spec 覆盖**：doc 06 §2 P0-A 五条任务 → Task 2/3（manifest+播放器）、3/7（计时+强杀）、11（资产）、10（历史/完成/成就）、9/10（屏）；§3 旅程 10 步 → Task 9/12；§4 门禁 → Task 12 Step 1/3。P0-A 明确不做清单防 creep。
2. **占位符**：domain 任务（2-6）含完整类型/函数契约与测试断言清单；UI 任务引用仓库内 normative 规格小节并给出精确数值锚点——实现者无需猜任何数值。
3. **类型一致性**：`CompanionState`/`CompanionEventType`（Task 2）被 Task 4/7/9 消费；`FocusSessionDoc`（Task 3）被 Task 6/7 消费；`StorageDriver`（Task 6）为唯一持久化接口；`Grant/RoomItemId`（Task 5）被 Task 6/10 消费。
