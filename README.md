# LofiCompanion

状态：产品定义与架构原型 0.1  
日期：2026-08-29  
正式产品名：待定

LofiCompanion 是一款事件驱动的 Lofi 学习陪伴 App。用户选择一套陪伴皮肤，
开始写作业、阅读或编程；角色在同一房间与固定镜头中持续陪伴，并在喝水、
暂停、休息、完成等事件发生时播放连贯动作。真实学习行为会沉淀为记录、成就、
排行榜进度，以及永久留在陪伴房间里的收藏物。

## 核心定义

产品不是视频生成工具，也不是给番茄钟加一张动态背景。核心产品是：

> 皮肤世界设定 + 事件行为剧本 + 连贯视频状态库 + 可靠专注计时。

AI 视频生成是皮肤生产能力；番茄钟是行为底座；角色与房间是情感载体；
成就和小组排行负责把一次次学习变成长期积累。

## 文档导航

- [产品需求](docs/01-PRD.md)
- [交互与视觉原型](docs/02-UX-PROTOTYPE.md)
- [技术架构原型](docs/03-ARCHITECTURE.md)
- [数据模型与 API](docs/04-DATA-AND-API.md)
- [收费与权益机制](docs/05-MONETIZATION.md)
- [实施计划与验收](docs/06-DELIVERY-AND-ACCEPTANCE.md)
- [视觉设计系统](docs/07-VISUAL-DESIGN-SYSTEM.md)
- [逐屏界面规格](docs/08-SCREEN-SPECIFICATIONS.md)
- [视觉验收与截图回归](docs/09-VISUAL-ACCEPTANCE.md)

## 技术基线

新产品从 `/Volumes/MacMiniDisk/workspace/MobileStarter` 派生。该基线包含 React
Native、Flutter、ArkTS 和 Next.js/PostgreSQL 控制面，且比同工作区的
`MobileStarter` 多五个会话/JWT 修复提交。首个可验证客户端以 React Native 为
金标准，服务端继续使用 Next.js；Flutter 与 ArkTS 按统一契约跟进，不在 P0 同时
重写三端业务界面。

## 已锁定原则

- 游客可以选择免费皮肤并开始第一轮专注。
- 基础计时、学习记录、数据导出、账号删除和无障碍能力不收费。
- 专注期间低打扰；事件动作短暂、可预测、可关闭动态效果。
- 排行榜默认好友/小组范围，自愿公开昵称，不展示任务正文。
- 付费不能购买学习时长、连续天数、排行榜名次或虚假成就。
- 生成失败必须自动返还冻结额度；收费结果必须可审计、可恢复购买。
- 逆向即梦接口只能用于研究验证，不能作为正式商业发布依赖。
- 原型图是构图和情绪基线；设计令牌、逐屏规格和视觉验收共同构成实现门禁。
