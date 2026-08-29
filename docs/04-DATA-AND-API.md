# 数据模型与 API 原型

版本：0.1

## 1. 核心实体

### FocusSession

`id`, `userId?`, `installationId`, `activity`, `plannedSeconds`, `status`,
`startedAt`, `endedAt?`, `effectiveSeconds`, `clientRequestId`, `ruleVersion`,
`syncState`, `createdAt`, `updatedAt`

### PauseInterval

`id`, `sessionId`, `startedAt`, `endedAt?`, `reason`

### CompanionSkin

`id`, `slug`, `name`, `description`, `creatorType`, `accessType`, `themeTokens`,
`previewAssetId`, `manifestVersion`, `moderationStatus`, `publishedAt?`

### SkinStateAsset

`id`, `skinId`, `state`, `variant`, `entryUrl?`, `loopUrl`, `exitUrl?`,
`posterUrl`, `audioUrl?`, `durationMs`, `loopable`, `checksum`, `version`

### SkinEventMapping

`id`, `skinId`, `eventType`, `stateAssetId`, `priority`, `interruptible`,
`cooldownSeconds`, `returnState`

### UserSkin

`userId`, `skinId`, `source`, `entitlementId?`, `unlockedAt`, `selectedAt?`

### AchievementDefinition / AchievementGrant

Definition：`id`, `ruleKey`, `ruleVersion`, `name`, `threshold`, `rewardItemId?`  
Grant：`id`, `userId`, `achievementId`, `sourceSessionId?`, `grantedAt`

### RoomItem / UserRoomItem

RoomItem：`id`, `skinCompatibility`, `name`, `assetId`, `slot`, `sourceType`  
UserRoomItem：`userId`, `roomItemId`, `sourceGrantId`, `equipped`, `unlockedAt`

### Friendship / StudyGroup / GroupMember

好友关系使用双向确认；小组记录 owner、可见性、周目标和成员角色。任务正文不进入社交实体。

### LeaderboardScore / LeaderboardSnapshot

Score：`userId`, `scopeType`, `scopeId`, `weekId`, `effectiveSeconds`,
`sessionCount`, `ruleVersion`, `updatedAt`  
Snapshot：`scopeId`, `weekId`, `rankingsJson`, `settledAt`, `ruleVersion`

### GenerationQuote / GenerationTask

Quote：`id`, `userId`, `templateId`, `parametersHash`, `credits`, `priceVersion`,
`expiresAt`  
Task：`id`, `userId`, `quoteId`, `provider`, `providerTaskId?`, `status`,
`progressStage`, `outputSkinId?`, `errorCode?`, `attempt`, `createdAt`, `updatedAt`

### CreditAccount / CreditReservation / CreditLedgerEntry

账户保存 `available/reserved/version`；reservation 对 task 唯一；ledger 只追加，不原地修改。

现有 MobileStarter 的 User、Session、Order、Subscription、Entitlement、Notification、
WebhookEvent 和设备表继续复用。

## 2. 关键数据库约束

- 每个用户或游客安装最多一个 `active|paused` 会话。
- `userId + clientRequestId` 唯一，防止重复创建会话。
- `achievementId + userId` 唯一；可重复等级成就需显式增加 level。
- `sourceSessionId + ruleVersion` 的奖励结算唯一。
- `provider + providerTaskId` 唯一（允许 null）。
- `generationTaskId` 的有效 reservation 唯一。
- credit ledger 的 `idempotencyKey` 唯一且不可更新/删除。
- 周榜 `scopeId + weekId + userId + ruleVersion` 唯一。
- 皮肤 manifest 和状态资产不可覆盖发布版本，只能创建新版本并切换指针。

## 3. API 路由

### Bootstrap 与皮肤

- `GET /api/v1/bootstrap`
- `GET /api/v1/skins`
- `GET /api/v1/skins/{id}`
- `GET /api/v1/skins/{id}/manifest`
- `POST /api/v1/me/skins/{id}/select`
- `GET /api/v1/me/skins`

### 专注

- `POST /api/v1/focus/sessions`
- `GET /api/v1/focus/sessions/active`
- `GET /api/v1/focus/sessions/{id}`
- `POST /api/v1/focus/sessions/{id}/pause`
- `POST /api/v1/focus/sessions/{id}/resume`
- `POST /api/v1/focus/sessions/{id}/complete`
- `POST /api/v1/focus/sessions/{id}/abandon`
- `GET /api/v1/focus/history`
- `GET /api/v1/focus/weekly-summary`

所有 mutation 接收 `Idempotency-Key`；客户端不上传“累计总分钟”，只上传可校验的会话事件。

### 成就与房间

- `GET /api/v1/achievements`
- `GET /api/v1/me/achievements`
- `GET /api/v1/me/room`
- `PATCH /api/v1/me/room/items/{id}`

### 好友、小组与排行榜

- `POST /api/v1/friends/invitations`
- `POST /api/v1/friends/invitations/{id}/accept`
- `GET /api/v1/friends`
- `POST /api/v1/study-groups`
- `POST /api/v1/study-groups/{id}/join`
- `GET /api/v1/study-groups/{id}`
- `GET /api/v1/leaderboards/friends?week=YYYY-Www`
- `GET /api/v1/leaderboards/groups/{id}?week=YYYY-Www`
- `PATCH /api/v1/me/leaderboard-privacy`

### 生成与额度

- `POST /api/v1/generation/quotes`
- `POST /api/v1/generation/tasks`
- `GET /api/v1/generation/tasks`
- `GET /api/v1/generation/tasks/{id}`
- `POST /api/v1/generation/tasks/{id}/cancel`
- `POST /api/v1/generation/tasks/{id}/retry`
- `GET /api/v1/credits/balance`
- `GET /api/v1/credits/ledger`

### 商店与购买

继续复用 MobileStarter 的 catalog、orders、verify、restore 和 provider webhook 路由；新增：

- `GET /api/v1/store/skin-products`
- `POST /api/v1/store/skin-orders`
- `GET /api/v1/store/skin-orders/{id}`

## 4. 统一异步状态

客户端和 API 使用同一语义：

`idle | loading | queued | processing | success | empty | error | offline | unauthorized`

生成任务终态：`completed | failed | cancelled`；内部允许 `reconciling`。购买订单沿用
MobileStarter 的订单状态机，不把“客户端已付款”直接视为权益已生效。

## 5. 事件和错误码

关键错误码：

- `ACTIVE_SESSION_EXISTS`
- `SESSION_ALREADY_FINAL`
- `SESSION_INTERVAL_INVALID`
- `SKIN_NOT_ENTITLED`
- `SKIN_ASSET_UNAVAILABLE`
- `LEADERBOARD_OPT_OUT`
- `QUOTE_EXPIRED`
- `INSUFFICIENT_CREDITS`
- `GENERATION_PROVIDER_UNAVAILABLE`
- `GENERATION_RECONCILING`
- `PURCHASE_PENDING`
- `PAYMENT_VERIFICATION_FAILED`

错误响应继续使用 MobileStarter 的 `code/messageKey/fieldErrors/traceId/retryable`。

