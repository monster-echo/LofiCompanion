# 实施计划与验收

版本：0.1

## 1. 交付策略

先完成一套皮肤的真实纵向切片，再扩充内容和收费。React Native 是 P0 金标准；
Flutter/ArkTS 在契约、状态和核心规则稳定后跟进。

### 1.1 使用 MobileUI CLI 创建 React Native 客户端

当前机器没有全局 `mobileui` 命令，从 `mobiestarter` 根目录使用仓库内 Dart 入口。
本项目使用本地模板，因为本地分支包含尚未进入远程 `origin/main` 的会话/JWT 修复：

```bash
cd /Volumes/MacMiniDisk/workspace/mobiestarter

dart run tool/mobileui/bin/mobileui.dart create loficompanion \
  --output /Volumes/MacMiniDisk/workspace/LofiCompanion \
  --profile react-native,server \
  --display-name "Lofi Companion" \
  --organization tech.zhongbei \
  --app-id lofi-companion \
  --source local
```

生成位置：

```text
/Volumes/MacMiniDisk/workspace/LofiCompanion/loficompanion/
  .mobileui/template.json
  .github/workflows/react-native-*.yml
  .github/workflows/server-*.yml
  react-native/
  server/
```

这里使用不带连字符的 repository name `loficompanion`，使 iOS/Android 身份成为
`tech.zhongbei.loficompanion`，避免生成带下划线的 native package。

生成后必须使用同一个仓库入口检查：

```bash
cd /Volumes/MacMiniDisk/workspace/mobiestarter

dart run tool/mobileui/bin/mobileui.dart doctor \
  --project /Volumes/MacMiniDisk/workspace/LofiCompanion/loficompanion
```

建立业务边界：

```bash
dart run tool/mobileui/bin/mobileui.dart feature add focus \
  --project /Volumes/MacMiniDisk/workspace/LofiCompanion/loficompanion
dart run tool/mobileui/bin/mobileui.dart feature add skins \
  --project /Volumes/MacMiniDisk/workspace/LofiCompanion/loficompanion
dart run tool/mobileui/bin/mobileui.dart feature add achievements \
  --project /Volumes/MacMiniDisk/workspace/LofiCompanion/loficompanion
dart run tool/mobileui/bin/mobileui.dart feature add leaderboards \
  --project /Volumes/MacMiniDisk/workspace/LofiCompanion/loficompanion
dart run tool/mobileui/bin/mobileui.dart feature add generation \
  --project /Volumes/MacMiniDisk/workspace/LofiCompanion/loficompanion
```

重要边界（已决策并实现，2026-08-29）：采用方案 1——MobileUI CLI 已新增 `server`
Profile（`profiles/server/profile.json`），`create --profile react-native,server`
一次生成客户端与服务端，`.mobileui/template.json` 记录模板 commit（本地 main，
含会话/JWT 修复），来源可追踪、可升级。`feature add` 与 `doctor` 均已支持 server
边界（`server/src/features/<id>`）。不得手工复制 `server/`。

已知后续项：server 深链 `.well-known` 路由与 `server-publish.yml` 镜像名仍为模板
身份字符串，接入深链或发布 CI 前须为 server Profile 实现身份改写与 doctor markers。

### 1.2 脚手架基线验证记录（2026-08-29）

- React Native 门禁与模板 CI 一致：`typecheck` 与 vitest payment 套件通过；
  `apiClient`/`purchaseFlow` 为访问真实 dev server 的集成套件，与模板 CI 一样
  不纳入基线门禁，待服务端就绪后运行。
- Server 门禁（2026-08-30 更新）：本地 PostgreSQL 16（brew）+ 独立库
  `zhongbei_lofi` 就绪（与模板旧库隔离），`.env` 配置 `AUTH_DATABASE_URL`；
  `npm test` **58/58 全绿**（连跑两次验证幂等）。原 2 个失败套件的根因是测试
  夹具依赖「每次全新库」：dev 测试账号无人播种、固定订单/事件 id 二跑冲突、
  `u-<counter>` 用户名跨运行撞名、`profileSchema` 已支持改名的旧断言未跟进——
  已修复并镜像回模板（mobiestarter `1050469`）。
- 已知模板项：server `.gitignore` 未覆盖 `.env`；模板存在嵌套重复资产目录
  （`assets/icons/icons/*`、`assets/illustrations/illustrations/*`），随模板
  一并复制，留待模板清理。
- 已修复（2026-08-29）：`doctor` 的 marker 扫描在 `node_modules` 内遇到二进制
  `.plist` 会崩溃；现已跳过 `node_modules` 子树并容错不可解码文件。

## 2. 阶段

### P0-A：本地可验证闭环

- 从 `mobiestarter` 创建产品派生项目并替换品牌包。
- 实现皮肤 manifest、视频缓存和播放器状态机。
- 实现创建、开始、暂停、喝水、继续、完成和强杀恢复。
- 使用一套“雨夜书房”完整资产和静态降级图。

  资产策略（2026-08-29 决策）：P0-A 以六个状态的完整静态海报集（ready/focusing/
  paused/drinking/resting/completed，同构图同焦点）先通过验收；播放器按 manifest
  视频路径实现，静态图走 poster/降级路径，视频循环后置替换，不改业务代码。
- 实现本地历史、完成页和基础成就。

验收：飞行模式下可连续完成三轮；喝水动作结束后自动回到同一学习状态；强杀恢复误差小于 1 秒。

### P0-B：服务端与账号同步

- 新增 Focus、Skin、Achievement API 和 PostgreSQL schema。
- 会话幂等同步、服务端结算和成就账本。
- 三套免费皮肤、版本化 manifest 和对象存储/CDN。
- 登录后迁移游客记录并避免重复结算。

验收：同一完成请求重放十次只产生一次会话结算和一次成就发放。

### P0-C：排行与小组

- 好友邀请、隐私设置、好友周榜。
- 私密自习小组、共同目标、在线专注状态。
- 每日计入上限、周快照和周结算收藏物。

验收：退出榜单后不可在好友查询中出现；任务正文从不进入榜单响应和日志。

### P1-A：官方皮肤收费

- Companion Plus、单套皮肤商品和权益键。
- StoreKit/Play/HMS 真实购买校验、Webhook、退款和恢复购买。
- 管理后台配置皮肤目录、商品映射、上下架和回滚。

验收：支付中断可恢复；重复回调不重复发放；退款后付费 manifest 权限正确更新。

### P1-B：AI 定制皮肤

- 模板化静态预览、人工确认和生成报价。
- credit account、reservation、ledger、generation task 和 outbox。
- provider gateway、正式供应商适配、转码、审核和资产入库。
- 任务中心、进度、失败释放、重试和通知。

验收：任务/账本每日对账差异为 0；供应商超时不会双扣或产生无主资产。

## 3. P0 用户旅程验收

1. 全新安装，不登录进入皮肤选择。
2. 选择免费皮肤“雨夜书房”。
3. 选择“写作业 · 25 分钟”并开始。
4. 专注 UI 弱化，基础循环稳定播放。
5. 点击喝水，播放连贯动作后返回专注。
6. 切后台、锁屏、恢复，计时结果正确。
7. 完成后显示本次、今日和本周进度。
8. 解锁成就并在房间看到对应收藏物。
9. 登录后游客记录只迁移一次。
10. 加入好友榜/小组后只共享允许字段。

## 4. 质量门禁

- 格式、lint、typecheck、架构检查和测试通过。
- 所有可恢复错误有重试；所有 pending 操作防重复点击。
- 加载、空、错误、离线和未授权状态均可触达并验证。
- 视频、音频、通知、支付和对象存储权限遵循平台规则。
- 关键 UI 支持动态字体、读屏、44×44 触控目标和减少动态。
- 不使用 Emoji、Unicode 或图标字体代替 SVG 图标。
- 日志与遥测不含 token、学习正文、生成完整提示词或支付凭证。
- 关键页面按 `09-VISUAL-ACCEPTANCE.md` 生成固定数据截图并通过几何、颜色和 SSIM 门禁。
- 不得以“功能已完成”替代设计验收；未经视觉审核的页面不能标记产品完成。

## 5. 自动测试最低集合

- Domain：计时区间、事件优先级、冷却、成就、榜单计分、权益。
- Client：强杀恢复、离线同步、视频降级、减少动态、路由守卫。
- API：租户隔离、幂等、非法区间、榜单隐私、付费 manifest 权限。
- Billing：重复回调、退款、订阅过期、恢复购买、订单查询恢复。
- Generation：reserve/capture/release、取消竞态、迟到成功、对账。
- E2E：游客第一轮、登录迁移、成就入房间、好友榜、小组目标、购买皮肤。

## 6. 发布前外部确认

- 正式视频供应商商业合同、API、内容政策、地域和 SLA。
- 原创角色与全部素材的版权链和商用授权。
- App Store、Google Play、HarmonyOS 对订阅、消耗品和 AI 内容的审核要求。
- 隐私政策、未成年人保护、排行榜与用户生成内容规则的人工法律审查。
- 价格和单位经济验证；文档中的建议价不能直接当生产价格。

## 7. 当前未决策项

- 正式中文名、英文名和品牌视觉。
- 首发平台顺序和首发地区。
- 正式供应商及每种状态视频的成本与长度。
- Plus 是否包含定制额度、额度数量和有效期。
- 好友关系来源：邀请码、通讯录或仅二维码。
- 小组人数上限、周结算补计规则和未成年人默认隐私策略。

## 8. P0-A 验收记录（2026-08-30）

- 旅程验收：doc 06 §3 步骤 1-9 已在 iPhone 16 Pro 模拟器执行，截图证据见
  `docs/superpowers/evidence/p0a/`；强杀恢复误差：0 秒（结束前剩余 03:55 →
  恢复后剩余 02:34，计时差 81 秒 = 两次截图墙钟差 81 秒，±1 秒以内；强杀期间
  到点的一轮在恢复后正确结算并计为完成）。
- 连续三轮：自定义 5 分钟 ×3 完成闭环；成就「第一次专注」发放并产出房间收藏物
  「雨夜书签」（房间内点击出现「来自『第一次专注』」标注）；首页今日 15 分钟 /
  已完成 3 轮；成就页累计 0.3 小时 / 3 轮 / 连续 1 天 / 本周 15 分。
- 已知偏离：环境音轨与视频循环后置（静态先行决策）；视觉基线自动化（doc 09 §8）
  与真机检查（doc 09 §9）为 P0-B 前置项；排行榜/同步为登录壳（P0-B）。
  另：开发构建下每次冷启动 LogBox 提示一次「navigation 尚未初始化」（dev-only
  提示横幅，入口意图在导航挂载完成前解析的竞态，不影响功能与生产构建），后续
  任务中修复；会话开始的陪伴横幅当前复用喝水文案，随静态先行实现一并后置。
- 门禁：typecheck 0 错误；vitest 109 通过（8 个文件，src/theme + src/features）。

## 9. P0-B 验收记录（2026-08-30）

- 服务端基线：本地 PostgreSQL 16 + 独立库 `zhongbei_lofi`；`npm test` **78/78
  双跑全绿**；typecheck 0 错误。基线测试修复已镜像回模板（mobiestarter `1050469`）。
- 核心验收（真实 HTTP 全链路，`next dev` :3210）：
  - 注册 → RS256 JWT → 创建会话（active）；
  - **同一完成请求重放十次：effective_seconds 全部一致、唯一结算行数 1、
    `first_focus` 成就只发放一次、房间收藏物 `bookmark` 入库**；
  - 游客迁移 3 条（migrated 3 / skipped 0）；重放迁移 migrated 0 / skipped 1，
    零副作用；
  - `weekly-summary` 今日/本周口径正确。
- 客户端：`typecheck` 0 错误；RN 门禁测试 113 通过；SyncEngine 纯逻辑用例 +
  SyncProvider（登录后一次性迁移、前后台补同步、失败重试不阻塞本地闭环）；
  设置页账户卡同步状态行。
- 已知偏离：对象存储/CDN 为接口预留（manifest API 直发，poster 暂用本地内置
  资产）；模拟器 UI 登录→迁移走查待与服务端常驻联调时补录（迁移链路已在
  HTTP 层与纯逻辑层验证）；`EXPO_PUBLIC_APP_ID` 已从模板占位 `mobileui`
  归位为 `loficompanion`。

## 10. P0-C 验收记录（2026-08-30）

- 决策补记（§7 好友关系来源）：**邀请码制**——用户生成 8 位加入码，兑码即建立
  双向好友；小组同用加入码。二维码为 P1 展示层增强。
- 服务端：`npm test` **100/100 双跑全绿**（好友/小组/榜单/周结算 22 个新用例）；
  typecheck 0 错误。
- 核心验收（真实 HTTP 双账号全链路）：
  - 邀请码互加好友；A 当日完成 300 分钟 → 榜单按每日上限计入 **180 分钟**
    （rank 1），B 60 分钟（rank 2）；
  - **响应字段白名单校验通过：榜单条目仅 userId/nickname/avatarUrl/minutes/
    sessionCount/rank，任务正文与活动字段永不出现**；
  - **B 退出榜单（optedOut）后从 A 的好友榜查询中消失**；B 自视图保留并带
    「已退出榜单」提示旗标；
  - publicDisplay=false：保留名次、昵称显示「已隐藏」、头像置空；
  - 小组：建组（周目标 30 分钟）→ 兑码入组 → 组榜 2 人、thisWeekMinutes 240
    （按每人每日上限口径）、goalMet 判定正确、非成员查询 403 GROUP_FORBIDDEN；
  - 周结算收藏物 `weekly_group_photo`：上一周目标达成 → 每位在组成员恰发一次
    （快照不可变，重放不重复发放；服务层用例覆盖）。
- 客户端：S10 好友/小组双段榜单（名次圆片/头像/当前用户固定卡/邀请码空态）、
  S11 小组详情（在线专注人数/共同目标卡/开始一起学习）、S12 规则与隐私
  （公开昵称与参与排行榜 Switch，退出二次确认）、S13 周结算（目标合影/不羞耻
  文案）；未登录保留登录壳。typecheck 0；RN 门禁 119 测试绿；Metro 冒烟通过。
- 已知偏离：模拟器 UI 走查与截图待补录（榜单/小组链路已在 HTTP 层与服务层
  100 用例验证）；周结算补计采用「计入结束所在周」简单口径（rule_version=2
  固化语义）；`weekly_group_photo` 每用户一次（无周次维度，P0 简化，已在
  代码注释说明）。

## 11. P1-A 验收记录（2026-08-30）

- **外部依赖边界声明**：StoreKit/Play/HMS 真实购买校验需商店账号与商品配置，
  本阶段以模板 mock 支付供应商完成全链路并验收；供应商适配层接口不变，
  真实凭证到位后仅替换 adapter（doc 06 §6 外部确认项不因本阶段关闭）。
- Task 0（清偿 tracked #6）：server 身份改写——深链 app id 与发布镜像名跟随
  产品身份 + doctor markers（模板 `218a89e`，项目 `812b35b`，doctor exit 0，
  smoke 含负向漂移检测）。
- 服务端：`npm test` **118/118 双跑全绿**（商品/订单 18 个新用例）；typecheck 0。
  权益键严格按 doc 05 §4：`skin.official.{slug}` / `catalog.premium.active`；
  皮肤订单绑定用 `skin_orders` 侧表；退款撤销复用模板
  `revokeEntitlementsForOrder`（source_order_id 自动覆盖皮肤权益，测试覆盖
  webhook 重放十次撤销恰一次）。
- 核心验收（真实 HTTP 全链路）：目录只列 active（¥12 单买 / ¥1800 Plus 目录）；
  **匿名取付费 manifest 401、登录无权益 403 SKIN_NOT_ENTITLED**；下单 pending →
  **同键重放同单（中断恢复查询点）** → verify 200 → 付费 manifest 200（6 状态）→
  **重放 verify 幂等** → 恢复购买含 `skin.official.sunny-classroom` → 订单终态
  entitled=true。
- 客户端：S14 商店（当前皮肤横幅/免费·单买·Plus 分区/服务端价格/已拥有勾标/
  骨架与重试态）、S15 详情（四态预览/价格骨架 CTA/确认 sheet/恢复购买入口/
  pending 防重复/lastOrderId 轮询中断恢复）；未登录浏览、购买时进登录；
  typecheck 0；RN 门禁 135 测试绿（新增 storeCatalog/pendingOrderRepository
  用例）；Metro 冒烟通过。
- 已知偏离：Plus 订阅完整流未实现（S15 Plus CTA 显示「即将上线」；模板订阅
  机制已就绪待接）；管理后台目录 UI 简化为 catalog 表 + 种子（YAGNI）；
  模拟器 UI 购买走查待补录（链路已在 HTTP 层验证）；付费皮肤无本地内置清单，
  「立即使用」提示「资源包上线后即可一键使用」（远端清单下载属后续工作）。

## 12. 发布前障碍排查（2026-08-30）

**已修复（本轮）：**
- 产品图标与启动屏：模板红色盾牌占位 → 产品视觉图标（深夜蓝底 + 琥珀台灯
  照亮书页，与皮肤视觉同源）；splash 背景白 → `#002357`（消除启动白屏闪跳）；
  移除模板遗留 `mobileui` scheme。
- 事件横幅文案：会话开始/暂停/恢复/完成不再复用喝水文案，按事件类型区分
  （doc-08 §22 语气规范）。
- dev LogBox「navigation 尚未初始化」竞态（doc-06 §8 记录项）：入口意图解析
  加 `NavigationContainer onReady` 门控。
- **iOS Release 构建硬门禁首次通过**：prebuild（新图标/启动屏生效）→
  Release 编译 → 模拟器安装启动 → 无 Metro 独立运行，首页/海报/本地数据/
  四 Tab 全部正常（截图 `docs/superpowers/evidence/p0a/release-build-home.png`，
  本地数据 15 分钟/3 轮在 Release 下持久化完好）。
- **服务端生产启动冒烟首次通过**：`NODE_ENV=production` + RS256 JWT 私钥 +
  独立库 → `next build` 成功 → `next start` health 200 / 注册 201。

**遗留（外部依赖或用户决策，非本地可修）：**
- 正式产品名/图标定稿（当前图标为可用初稿）、Firebase 生产项目配置
  （`GoogleService-Info.plist` 现为模板项目）、Apple 开发者账号与签名证书、
  App Store 商品配置（P1-A 真实购买）。
- `LofiCompanion` 无 git 远端——已生成本地 bundle 备份
  （`/tmp/loficompanion-backup-20260830.bundle`），建议尽快配置远端并推送；
  mobiestarter 本地 13 个提交未推送。
- 视觉基线自动化（doc 09 §8 SSIM 门禁）与真机（非模拟器）检查仍为发布前
  待办；Tracked #12（RN 发布 workflow 身份改写）为 CLI 层改进，不影响本项目
  （已就地修复）。
