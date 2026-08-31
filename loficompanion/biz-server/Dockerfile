ARG NODE_IMAGE=node:22-alpine

FROM ${NODE_IMAGE} AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
# schema 先于 npm ci：postinstall 的 prisma generate 需要 schema 在场
COPY prisma ./prisma
RUN npm ci

FROM ${NODE_IMAGE} AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM ${NODE_IMAGE} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3320

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs \
  && chown nextjs:nodejs /app

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3320

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3320/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

# 上线前先跑一次迁移：docker exec <container> npx prisma migrate deploy
CMD ["node", "server.js"]

# ── 自习室 WebSocket 服务（同镜像第二入口；compose.ws.yml / docker run --target）──
# 不走 standalone 追踪：WS 进程零 Next API，直接带全量 node_modules
# （ws/jose/@prisma/client）+ TS 源码，由 node 内建类型剥离运行。
FROM ${NODE_IMAGE} AS wsrunner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs \
  && chown nextjs:nodejs /app

COPY --from=dependencies /app/node_modules ./node_modules
COPY --chown=nextjs:nodejs prisma ./prisma
COPY --chown=nextjs:nodejs src ./src
COPY --chown=nextjs:nodejs package.json ./

USER nextjs

ENV STUDYROOM_WS_PORT=3321

EXPOSE 3321

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3321/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "--import", "./src/ws/register.mjs", "--experimental-transform-types", "src/ws/server.ts"]
