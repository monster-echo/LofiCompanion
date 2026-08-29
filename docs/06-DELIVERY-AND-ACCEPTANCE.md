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
- Server 门禁：`typecheck`、`lint` 与 `payment-apple` 套件通过；`core`/`auth`/
  `payment` 套件需要活动 PostgreSQL（导出 `AUTH_DATABASE_URL`），本地数据库
  就绪前作为已知前置条件处理。
- 已知模板项：server `.gitignore` 未覆盖 `.env`；模板存在嵌套重复资产目录
  （`assets/icons/icons/*`、`assets/illustrations/illustrations/*`），随模板
  一并复制，留待模板清理。

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
