# 订阅沙盒验收（Apple / Google）

版本：0.1

上架前的订阅全链路验收手册：购买 → 验签 → 权益 → 恢复 → 续订 → 取消 → 到期
→ 退款 → 防伪 → 订单中心。前置是订单系统上架加固（auth tier 读时推导、
Google webhook OIDC、biz 皮肤订单列表、RN 订单中心，2026-09-11 三仓提交）。

## 0. 通过标准

两端各跑完 §2/§3 并全部打勾，且 §4 UI 清单无阻断项，订阅方可正式上架。
任何一项不过：按 §6 排查，修复后**从该节重跑**（幂等，无需整轮重来）。

占位符约定（下文统一）：

| 占位符 | 含义 | 查询处 |
|---|---|---|
| `<AUTH>` | auth 基础设施域名 | auth.zhongbei.tech（生产） |
| `<APP_ID>` | X-App-Id 头 | auth 服务端 `APP_ID` env |
| `<TOKEN>` | 用户 Bearer | §1.4 登录换取 |
| `<PKG>` | Android 包名 | Play Console |
| `<TOPIC>` / `<SUB>` | RTDN Pub/Sub 主题/推送订阅 | GCP 控制台 |
| `<UID>` | 用户 id | users 表按邮箱查 |

## 1. 前置：部署与配置（未完成不进入 §2/§3）

### 1.1 部署顺序 biz → auth（app 最后发版）

```bash
# biz：双机房 ghcr CI（tengxun-2 / ora1），发完 ping 双区
curl -s https://lofi.biz.zhongbei.tech/api/health
# auth：MobileStarter CI
curl -s https://<AUTH>/api/health
```

### 1.2 Google RTDN 推送订阅启用 OIDC（人工，一次性）

```bash
# ① 建专用服务账号（已有则跳过）
gcloud iam service-accounts create rtdn-push --project=<PROJECT>

# ② 推送订阅绑定 SA + 显式 audience（audience=完整推送 URL）
gcloud pubsub subscriptions modify-push-config <SUB> \
  --push-endpoint=https://<AUTH>/api/v1/webhooks/google \
  --push-auth-service-account=rtdn-push@<PROJECT>.iam.gserviceaccount.com \
  --push-auth-token-audience=https://<AUTH>/api/v1/webhooks/google
```

```bash
# ③ auth 侧设 env 并重启（零代码切换到强制校验）
GOOGLE_PUBSUB_AUDIENCE=https://<AUTH>/api/v1/webhooks/google
# 可选加固：GOOGLE_PUBSUB_SERVICE_ACCOUNT=rtdn-push@<PROJECT>.iam.gserviceaccount.com
```

### 1.3 防伪生效确认（§1.2 完成后立即做）

```bash
# 未签名请求 → 预期 401（此前是放行）
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://<AUTH>/api/v1/webhooks/google \
  -H "Content-Type: application/json" \
  -d '{"message":{"data":"e30=","messageId":"probe-1"}}'
```

### 1.4 测试账号与 Token

- Apple：App Store Connect → 用户和访问 → 沙盒测试员（新建专用邮箱）
- Google：Play Console → 测试人员（license tester）+ 内部测试轨道
- auth 测试账号（首次 publish 已补种），换 Token：

```bash
TOKEN=$(curl -s -X POST https://<AUTH>/api/v1/auth/login \
  -H "x-app-id: <APP_ID>" -H "x-app-environment: production" \
  -H "Content-Type: application/json" \
  -d '{"email":"<测试账号>","password":"<密码>"}' | jq -r .data.token)
echo $TOKEN
```

## 2. Apple 沙盒验收（TestFlight）

沙盒订阅自动加速续订（真实时间 → 沙盒时间）：

| 周期 | 1 周 | 1 月 | 2 月 | 3 月 | 6 月 | 1 年 |
|---|---|---|---|---|---|---|
| 沙盒 | 3 分 | **5 分** | 10 分 | 15 分 | 30 分 | 1 小时 |

沙盒订阅最多自动续 12 次；设备需在设置 → App Store 登录沙盒账号。

- [ ] **2.1 购买**：TestFlight 包内购买 Plus → 无报错，会员卡「生效中」
- [ ] **2.2 服务端入账**（auth 库）：

```sql
SELECT id, plan_id, status, expires_at FROM orders
  WHERE user_id='<UID>' ORDER BY created_at DESC LIMIT 3;      -- 新单 status=success
SELECT plan_id, status, renew_at FROM subscriptions
  WHERE user_id='<UID>' ORDER BY updated_at DESC LIMIT 1;      -- status=active
SELECT entitlement_key, active FROM user_entitlements
  WHERE user_id='<UID>' AND active=1;                          -- tier 权益齐
```

```bash
# /me/entitlement 出 token（tier 推导正向）
curl -s -X POST https://<AUTH>/api/v1/me/entitlement \
  -H "Authorization: Bearer $TOKEN" -H "x-app-id: <APP_ID>" \
  -H "x-app-environment: production"
```

- [ ] **2.3 续订闭环**：等一次加速续订（月付 5 分钟）→ 上表 `renew_at` 前移、
  权益行 expires_at 前移、订单行 expires_at 前移（DID_RENEW webhook）
- [ ] **2.4 取消续订**：设置 → App Store → 沙盒账号 → 管理订阅 → 取消
  → **权益保留至到期日**（不立即失效）；到期后 `subscriptions.status=expired`、
  App 会员卡切「已过期」徽章 + 续费 CTA
- [ ] **2.5 恢复购买**：卸载重装（同沙盒账号）→ 会员页「恢复购买」→ 权益回来
- [ ] **2.6 webhook 连通性**：App Store Connect → App → App Store Server
  Notifications v2 →「Send Test Notification」→ auth 日志收到 `TEST` 且 200
- [ ] **2.7 退款自愈（核心安全项）**：沙盒无法直接发起 Apple 退款，用
  「退款后状态注入」验证读时推导自愈——

```sql
-- 模拟退款终态：撤该用户全部 tier 权益（生产上由 REFUND webhook 自动做）
UPDATE user_entitlements SET active=0 WHERE user_id='<UID>';
```

```bash
# 自愈断言：无需任何 tier_id 清理，立即拿不到 token、tier 归 null
curl -s -X POST https://<AUTH>/api/v1/me/entitlement ... # 预期 token:null
curl -s https://<AUTH>/api/v1/membership/current -H ...  # 预期 tier:null
```

（真实 REFUND 事件的处理在上架后由 Apple 侧真实退款触发；单元级映射已由
`tests/payment-apple.test.ts` 锁定。）

## 3. Google 沙盒验收（内部测试轨道）

Play 侧没有 Apple 式自动加速：验收续订/到期用**短周期免费试用**（如 1 天）
或直接用 gcloud 向 RTDN 主题注入**真实 purchaseToken 的事件**（最可靠）。

- [ ] **3.1 购买**：内测轨道安装 → 购买 Plus → 会员卡「生效中」+ 下次续费日期
- [ ] **3.2 服务端入账**：同 §2.2（orders/subscriptions/user_entitlements 三查）
- [ ] **3.3 事件矩阵注入**（每条注入后跑对应断言）：

```bash
# 发布 DeveloperNotification（⚠️ --message 传原始 JSON 字符串，gcloud 会自行
# base64；勿再手动 base64 一层，双重编码会让服务端 data 解码失败 401）
gcloud pubsub topics publish <TOPIC> --project=loficompanion --message='{
  "packageName": "<PKG>",
  "subscriptionNotification": {"notificationType": <NT>,
    "purchaseToken": "<TOKEN>", "subscriptionId": "<SKU>"}
}'
```

| NT | 事件 | 注入后断言 |
|---|---|---|
| 3 | CANCELED | `subscriptions` 仍 active、权益 active（保留至到期） |
| 12 | EXPIRED | `subscriptions`=expired、权益 active=0、订单不变 |
| 5 | ON_HOLD | 同 expired（挂起撤权益） |
| 7 | RESTARTED | `subscriptions` 翻回 active、权益重发（恢复闭环） |
| 2 | RENEWED | renew_at 前移（需 Play API 可达以拉 expiry） |

- [ ] **3.4 真实退款**：Play Console → 订单管理 → 退款（勾选**撤销权限**）
  → voidedPurchaseNotification → 订单 `refunded`、权益撤销、
  App 订单中心该单显示「已退款」pill 且 `entitled:false`
- [ ] **3.5 恢复购买**：卸载重装 → 会员页「恢复购买」→ 权益回来（未退款的单）
- [ ] **3.6 OIDC 防伪**：§1.3 已验 401；本节注入的合法推送应 200 且生效
  （Pub/Sub 对 401 不重投、5xx 重投——auth 日志无重试风暴即正常）

## 4. 订单中心 / 会员页 UI 清单（双端同跑）

- [ ] 订单列表：会员单 + 皮肤单合并、按创建时间倒序、月分组正确
- [ ] 筛选 chips：全部 / 会员 / 皮肤 三档正确收敛
- [ ] 状态 pill：成功绿✓ / 失败红✕ / 处理中琥珀🕐 / 退款灰↩（图标+颜色双通道）
- [ ] 行展开：orderId、SKU、权益态、完成时间；皮肤单「查看皮肤」深链到详情页
- [ ] 下拉刷新：刷新期间保留旧数据；空态 → 「去逛逛皮肤商店」CTA
- [ ] 降级（可选）：临时把 `EXPO_PUBLIC_BIZ_API_URL` 指向无效域名重打包 →
  会员单照常显示 + 「皮肤订单暂时拉取不到」提示条；双侧全断 → 整页错误 + 重试
- [ ] 会员页：生效中显示「下次续费 {{date}}」；过期显示「已过期」徽章 + 续费 CTA

## 5. 结果记录

| # | 项目 | Apple | Google | 备注 |
|---|---|---|---|---|
| 1 | 购买→权益 | ☐ | ☐ | |
| 2 | 恢复购买 | ☐ | ☐ | |
| 3 | 续订 | ☐ | ☐ | |
| 4 | 取消→到期 | ☐ | ☐ | |
| 5 | 退款→自愈 | ☐ | ☐ | Apple 为注入式 |
| 6 | webhook 防伪 | ☐ | ☐ | |
| 7 | 订单中心 UI | ☐ | ☐ | |

## 6. 排查速查

- **webhook 401（Google）**：env 已设但 push 订阅未配 SA → §1.2 ②；
  或 audience 不一致（默认=完整推送 URL）
- **webhook 401（Apple）**：JWS 验签失败——确认通知源环境（Sandbox/Production
  双兜底已内置，检查 certs 目录）
- **续订后权益没续**：Google renew 需 Play API 拉 expiry（服务账号凭证 +
  大陆可达性走中转）；看 auth 日志 renew 是否 `applied:true` 但无 expiresAt
- **App 内购买报 `PAYMENT_PROVIDER_NOT_CONFIGURED`**：对应商店凭证 env 缺失
  （APPLE_*/GOOGLE_*），503 不落 failed 单、停在 processing 属预期
- **订单中心单侧空**：查 §4 降级项——先确认 biz 双区都发到了
- **Metro 全黑/启动崩**：见 docs/10 与项目记忆（清缓存重启 Metro）
