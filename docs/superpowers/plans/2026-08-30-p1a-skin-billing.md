# P1-A 官方皮肤收费 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付 doc 06 §2 P1-A 的本地可验证部分：皮肤商品目录、皮肤订单、权益键（`skin.official.{skinId}` / `catalog.premium.active`）、付费 manifest 权限门禁、Webhook 退款撤销、恢复购买；客户端皮肤商店与购买流（S14/S15）。

**外部依赖边界（明确记录）：** StoreKit/Play/HMS 真实购买校验需要商店账号与商品配置——本阶段用模板既有 **mock 支付供应商**（`src/server/payment-providers.ts`，模板含完整订单/幂等/webhook/订阅/退款撤销测试），供应商适配层保持接口不变，真实凭证到位后仅替换 adapter。发布前外部确认项（doc 06 §6）不因本阶段关闭。

**Architecture:** 复用模板支付域（orders/entitlements/webhook 去重/订阅）+ P0-B 已建立的 skins 域。新增 `skin_products` 目录表（skin ↔ store 商品映射 ↔ 状态）与管理种子；`skin.official.{skinId}` 权益由 `issueEntitlements`/`revokeEntitlementsForOrder` 发放与撤销；`GET /skins/{id}/manifest` 对付费皮肤做权益门禁（免费皮肤不变）；客户端 S14/S15 按 doc 08 规格，购买走模板既有 checkout 模式。

**规范真源：** doc 05（产品矩阵/权益键 §4/订单流程 §5/收费验收 §8）、doc 04 §3（store 路由）、doc 08 §14/§15（商店/详情屏）、doc 06 §2 P1-A 与 §6（外部确认）。

---

### Task 0: server 身份改写（ tracked 任务 #6 清偿）

- [ ] `tool/mobileui/lib/identity_rewriter.dart`：server Profile 增加替换表——`.well-known/apple-app-site-association` 与 `assetlinks.json` 的 `com.mobileui.mobilestarter`/`com.mobileui.mobileui_flutter` → `${appId}`（manifest.org+appId）；`server-publish.yml` 镜像名 `zhongbei-auth` → `${packageName}`。`doctor_command.dart` markers 表加 server 条目（模板残留即 FAIL）。smoke test 扩展断言。MobileStarter 同步提交。Commit×2。

### Task 1: 皮肤商品目录 + 权益门禁

**Files:** schema（`skin_products`: id, skin_id UNIQUE, entitlement_key, store_product_ids jsonb(TEXT), price_display（分/币种）, status CHECK active/inactive, created_at/updated_at）+ 种子（`sunny-classroom` 单买 ¥12=1200 分、`midnight-workstation` Plus 目录）+ skins 表加 `access_type` 已有（free/paid/premium）——`sunny-classroom` 置 `paid`、`midnight-workstation` 置 `premium`（moderation 仍 pending_assets，仅目录语义）+ manifest 路由门禁：非 free 皮肤无有效权益 → `SKIN_NOT_ENTITLED`（权益检查 `user_entitlements active=1 AND entitlement_key='skin.official.{slug}' OR 'catalog.premium.active'`，未登录一律 401）。

- [ ] 失败测试：未购/未登录取付费 manifest 被拒；发放权益后可取；撤销后不可取；免费皮肤不受影响；目录只列 active
- [ ] Commit `feat(server): 皮肤商品目录与付费 manifest 权限门禁`

### Task 2: 皮肤订单（购买/重复回调/退款/恢复）

**Files:** `src/features/skins/data/order-service.ts` + 路由 `store/skin-products`（GET 目录）、`store/skin-orders`（POST 幂等下单）、`store/skin-orders/[id]`（GET 查单）、`purchases/verify` 扩展（mock 凭证 → 完成订单 + 按 product 发 `skin.official.{slug}` 权益，同一事务）；webhook 退款（模板已撤销 entitlements）→ 验证 skin 权益同样被撤。恢复购买：模板 `restore` 端点已按 entitlements 返回 keys——补皮肤权益自然包含。

- [ ] 失败测试：下单幂等（同 idempotency key 同单）；verify 后权益生效且可取付费 manifest；同一 webhook 重放十次只发一次；退款 webhook 后权益撤销且 manifest 403；恢复购买返回 skin 权益键；inactive 商品不可下单
- [ ] Commit `feat(server): 皮肤订单——mock 购买/退款撤销/恢复购买全链路`

### Task 3: 客户端皮肤商店与购买流（S14/S15）

**Files:** `react-native/src/features/store/…` + apiClient 扩展 + 路由 `store.home`/`store.skinDetail`

- S14（doc 08 §14）：App bar「陪伴皮肤」+ 当前皮肤横幅 164「正在使用」+ 分区（免费/单买/Plus）卡片（poster/名称/状态数/价格标签，无虚构原价）+ 已拥有勾选；未登录可浏览，购买时进登录
- S15（doc 08 §15）：媒体预览 390 可切 ready/focus/drink/complete 四态 + 权益说明 + 价格来自服务端 + 主 CTA「¥X 永久解锁」/「加入 Plus」+ 购买确认 sheet（恢复购买入口）+ 购买 pending 防重复点击 + 成功解锁反馈
- 支付中断恢复：进入详情时查未完成订单恢复终态（doc 05 §5）
- Plus 订阅页 S16：模板 membership 已有——补「皮肤目录」价值文案与权益键联动入口（轻量）

- [ ] typecheck 0；RN 门禁绿；Metro 冒烟；Commit `feat(screens): 皮肤商店与购买流（S14/S15）`

### Task 5: P1-A 验收与落档

- [ ] 真实 HTTP 验收脚本：目录 → 下单 → verify → 权益 → 付费 manifest 可取 → webhook 退款 → 撤销 → 403 → 恢复购买可见；重复回调/中断恢复断言
- [ ] `docs/06` §11 P1-A 验收记录（含外部依赖边界声明）；Commit `docs: P1-A 验收记录`

---

## Self-Review

1. 覆盖：doc 06 P1-A 五条中，「真实购买校验」以 mock adapter + 接口不变交付（外部依赖显式记录）；商品映射/上下架/回滚 = 目录表 status + 种子（管理后台 UI 为 P1 后续，YAGNI 记录）；验收句（中断恢复/重复回调/退款后 manifest 权限）→ Task 2/5。
2. 权益键严格按 doc 05 §4；客户端不硬编码价格（doc 05 §8）。
3. 与 P0-B 的 SKIN_NOT_ENTITLED 语义衔接：P0-B 用于「不存在/未发布」，P1-A 扩展「存在但无权益」——错误码同名字段区分（fieldErrors 或 message），保持 doc 04 §5 单一码。
