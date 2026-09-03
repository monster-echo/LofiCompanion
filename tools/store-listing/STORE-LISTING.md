# 商店上架文案清单（App Store + Google Play）

> 提交时逐项粘贴。中英对应；First release: zh-CN 为主。

## App Store Connect

| 字段 | 内容 |
|---|---|
| 名称 Name（≤30） | `Lofi Companion - 专注陪伴` |
| 副标题 Subtitle（≤30） | `lofi 音乐 · 专注 · 自习室` |
| 类别 | 主：效率（Productivity）；副：音乐（Music） |
| Support URL | `https://auth.zhongbei.tech/support?app=lofi-companion` |
| Marketing URL | `https://auth.zhongbei.tech/marketing?app=lofi-companion` |
| 隐私政策 URL | `https://auth.zhongbei.tech/legal/privacy?app=lofi-companion` |
| 用户隐私选择 URL | 留空（无广告/跨应用追踪 SDK） |
| 版权 | `© 2026 苏州终北科技有限公司` |
| 价格 | 免费 + App 内购买 |

### 副标题备选（en-US）
`Lofi music · focus · study rooms`

### 描述 Description（≤4000）

```
Lofi Companion 是一位安静的专注伙伴：选一位陪伴角色，放一段 lofi，开始你的专注。

【陪伴式专注】
六种陪伴状态随你的节奏变化——开始、暂停、休息、喝水提醒、完成庆祝。不是冷冰冰的计时器，而是一起坐下来的伙伴。

【自习室 · 弹幕陪伴】
进入雨夜书房、晴日教室、午夜工位，看到同一时刻在线的自习伙伴。发一条弹幕互相加油，你不在独自努力。

【成就与房间】
完成专注解锁成就与房间收藏物：小台灯、绿植、自习伙伴合影……房间随你的坚持慢慢丰富。

【数据同步】
专注记录、学习统计、成就进度登录即同步，换设备无缝衔接。

【Companion Plus（可选订阅）】
- 全部官方与季节皮肤
- 高级房间布置（更多槽位与环境音）
- 高级学习洞察

深夜工作台等付费皮肤为一次性买断（$0.99），永久解锁。
免费即可使用全部核心功能：专注计时、自习室、基础成就。

《隐私政策》《用户协议》《订阅与自动续期说明》可在应用内「设置 → 法务」与支持页面查看。
```

### 关键词 Keywords（≤100，逗号分隔）
`lofi,专注,自习室,番茄钟,学习,计时器,白噪音,专注音乐,study,focus,pomodoro`

### 推广文本 Promo Text（≤170，可随时改）
`今晚，从一间安静的房间开始。`

### App 隐私标签（数据收集申报）
| 数据类型 | 用途 | 关联身份 | 追踪 |
|---|---|---|---|
| 联系信息（邮箱/电话） | App 功能（账号） | 是 | 否 |
| 标识符（用户 ID、设备 ID） | App 功能、分析 | 是/否 | 否 |
| 使用数据（产品交互、分析） | 分析 | 否（可关） | 否 |
| 购买（购买历史） | App 功能（解锁权益） | 是 | 否 |
| 诊断（崩溃数据、性能） | App 功能、分析 | 否 | 否 |
| 用户内容（头像、工单、弹幕） | App 功能 | 是 | 否 |

⚠️ 均不用于第三方广告/跨应用追踪（与「用户隐私选择 URL 留空」口径一致）。

### 截图（6.9"/6.5" iPhone + iPad 如支持）
建议 5 张：首页陪伴画面 → 自习室弹幕 → 皮肤画廊/商店 → 专注中（时钟+陪伴）→ 成就房间。

## Google Play

| 字段 | 内容 |
|---|---|
| 应用名称（≤30） | `Lofi Companion - 专注陪伴` |
| 简短说明（≤80） | `lofi 音乐陪伴专注：自习室弹幕、成就房间、皮肤商店` |
| 完整说明 | 同 ASC 描述（可复用） |
| 隐私政策 | `https://auth.zhongbei.tech/legal/privacy?app=lofi-companion` |
| 数据安全表单 | 按 ASC 隐私标签同口径填写（不收集/不共享用于广告） |
| 内容分级问卷 | 无暴力/无博彩/无广告 → Everyone |
| 目标受众 | 13+（含青少年学习场景，勿选 ≤12 儿童向） |
| 应用内商品 | `tech.zhongbei.loficompanion.theme.midnight`，$0.99，非消耗型 |
| 发布轨道 | 先内部测试（Internal testing）→ 封闭测试 → 正式 |

## 提交通道凭证（eas submit 需要）
- iOS：ASC API Key（Issuer ID + Key ID + AuthKey_XXX.p8）
- Android：Play Console 服务账号 JSON（需在「API 权限」关联并授权）
