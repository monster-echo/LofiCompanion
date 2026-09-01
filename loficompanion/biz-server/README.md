# biz-server（Lofi Companion 业务后端）

这个 app 独有的业务后端（Next.js + Postgres + Prisma）。与共享基础设施
`auth.zhongbei.tech`（MobileStarter 的 `server/`）的**唯一关系**是：验签它签发的
JWT（本地 JWKS 验签，零在线回调）+ 上报遥测日志。业务数据存自己的库，
用户身份以 JWT `sub`（user_id）为逻辑外键——删掉本服务与库，基础设施无感。

## 环境变量

见 `.env.example`。`APP_ID` 由 `mobileui create` 的身份改写自动写入。

## 本地开发

```bash
npm install            # 含 prisma generate（postinstall）
cp .env.example .env   # 填 DATABASE_URL
npx prisma migrate dev # 建表
npm run dev            # http://localhost:3320/api/health（自习室 SSE 长流同进程）
```

`GET /api/v1/ping` 是垂直切片样板（JWT 验签 → Prisma → 遥测），
带客户端 access token（`Authorization: Bearer <token>`）访问。

## 业务模块

```bash
mobileui feature add <name>   # 生成 src/features/<name>/ 四层骨架（server 侧落点就是本目录）
```

## 部署

### A. Docker（境内默认）

CI 会构建 GHCR 多架构镜像（镜像名 = 产品包名，由 create 时身份改写写入）。
部署机上：

```bash
docker pull ghcr.io/<owner>/<package-name>:latest
docker run -d -p 3320:3320 --env-file .env ghcr.io/<owner>/<package-name>:latest
docker exec <container> npx prisma migrate deploy   # 首次/升级时
```

### B. Vercel（境外，推荐路径）

1. Vercel 导入本仓库，Root Directory 设为 `biz-server`
2. 环境变量：`DATABASE_URL`（建议 [Neon](https://neon.tech)，serverless Postgres）、
   `APP_ID`、`AUTH_BASE_URL`、`JWT_AUDIENCE`
3. Framework Preset 选 Next.js 即可——`postinstall` 已跑 `prisma generate`，
   部署后在 Neon 上执行一次 `npx prisma migrate deploy`（本地指向 Neon URL 跑）

### C. Cloudflare（境外，备选）

走 [OpenNext](https://opennext.js.org/cloudflare) 适配器包装本目录；
Prisma 需换 [driver adapter](https://www.prisma.io/docs/orm/overview/databases/database-drivers)
（Neon serverless / Hyperdrive）。没有 Vercel 那么顺滑，除非有明确 CF 需求否则优先 B。

### 自习室实时层（SSE，随 REST 进程）

自习室弹幕/presence 长连接用 **SSE** 承载在 Next.js 进程内（无独立进程/端口）：

```
GET  /api/studyroom/stream?room=<id>  SSE：snapshot / presence.update / presence.rooms / danmaku.new
POST /api/studyroom/danmaku?room=<id> 发弹幕（鉴权必填；失败走标准 error envelope）
GET  /api/studyroom/rooms             房间在线数（列表页轮询）
```

SSE 经反代（如 Caddy `reverse_proxy`）默认流式透传即可，无需 upgrade 配置。
presence 是单实例内存态——**勿起多个 Next worker / 多副本**（会拆散房间成员表）；
扩容路径为 Redis pub/sub（尚未实现）。

## 遥测

`src/telemetry/reporter.ts` 把日志/错误以 `biz_log` / `biz_error` 事件批量上报到
`{AUTH_BASE_URL}/api/v1/telemetry/events`，在基础设施 admin 控制台按本 app 查看。
fire-and-forget：基础设施工不可达时静默丢弃，绝不阻塞业务响应。
