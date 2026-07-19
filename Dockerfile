# ═══════════════════════════════════════════════════════════════════
#  收银系统一体化镜像:
#    - 一个进程跑 NestJS API
#    - 同时托管两个前端(POS /pos + admin /admin)
#    - 只暴露一个端口 3001
#
#  设计说明:
#    · Prisma client 在 builder 里 generate,连同 node_modules 一起搬到 runner
#    · 前端 dist 复制过来就好,不带 vite / esbuild 那一堆构建时依赖
#    · 保留 prisma CLI(devDep)让 entrypoint 能跑 migrate deploy;
#      如果哪天要极限瘦身镜像,可以用 pnpm deploy --prod + 单独拷 .prisma/client,
#      但当前 ~500MB 完全能接受,不值得增加维护复杂度
#
#  镜像源:默认 docker.io/library/node:20-alpine。国内拉不动时:
#    docker build --build-arg NODE_IMAGE=docker.m.daocloud.io/library/node:20-alpine .
# ═══════════════════════════════════════════════════════════════════

ARG NODE_IMAGE=node:20-alpine

FROM ${NODE_IMAGE} AS base
# Prisma 用 libssl,alpine 需要显式装;dumb-init 让容器里的 node 能收到信号,ctrl+c 干净退出
RUN apk add --no-cache libc6-compat openssl dumb-init
# 锁 pnpm 版本(跟 root package.json 的 packageManager 对齐)
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# ── builder:装依赖 + 构建三个 app ────────────────────────────
FROM base AS builder
WORKDIR /app

# 先只复制 manifest,这一层的缓存命中率最高 —— 源码改一行不重装依赖
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/admin/package.json apps/admin/
COPY apps/pos/package.json apps/pos/
COPY apps/mobile/package.json apps/mobile/
COPY packages/shared/package.json packages/shared/

# --ignore-scripts:防止 packages/shared 的 prepare 阶段 tsc 找不到源码报错。
#   下面手动跑 prisma generate + shared build 替代 pnpm 的自动 lifecycle。
RUN pnpm install --frozen-lockfile --ignore-scripts

# 复制源码,进入构建
COPY . .

# Prisma 生成 + build shared → build api → build 两个前端
# mobile 是 Capacitor,不在这里构建
RUN pnpm --filter @shouyin/api exec prisma generate \
 && pnpm --filter @shouyin/shared build \
 && pnpm --filter @shouyin/api build \
 && pnpm --filter @shouyin/admin build \
 && pnpm --filter @shouyin/pos build

# pnpm deploy:把 API 及其 workspace 依赖(@shouyin/shared)拍平成一个自包含目录 /prod/api,
# 里面的 node_modules 不再靠指向仓库根的 .pnpm 符号链接,复制到 runner 阶段能独立工作。
# --prod 剔除 devDeps(nest cli / vite / tsc 等构建时才用);
# 我们把 prisma CLI 挪到了 dependencies,所以 runner 里能跑 db push。
RUN pnpm --filter @shouyin/api deploy --prod /prod/api

# deploy 出来的 node_modules 是重新装的,里面的 @prisma/client 只是空壳(需要 generate 才有真的 client)。
# 把上一步 builder 里已经 generate 好的 client 覆盖过去,省一次 generate 的时间和 devDep。
RUN cp -r /app/apps/api/node_modules/.pnpm/@prisma+client*/node_modules/.prisma \
      /prod/api/node_modules/.pnpm/@prisma+client*/node_modules/ 2>/dev/null \
 || cp -r /app/apps/api/node_modules/@prisma/client/node_modules/.prisma \
      /prod/api/node_modules/@prisma/client/node_modules/ 2>/dev/null \
 || (cp -r /app/apps/api/prisma /prod/api/prisma \
     && cd /prod/api \
     && node node_modules/prisma/build/index.js generate --schema prisma/schema.prisma)

# ── runner:干净的运行时镜像 ─────────────────────────────────
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3001 \
    POS_DIST=/app/apps/pos/dist \
    ADMIN_DIST=/app/apps/admin/dist

# 只带运行时需要的东西:
#   · /prod/api:pnpm deploy 出来的自包含目录(node_modules 已展平,不依赖 workspace 布局)
#   · Prisma schema(entrypoint 里 db push 要读)
#   · 两个前端 dist
COPY --from=builder /prod/api ./apps/api
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/apps/pos/dist ./apps/pos/dist
COPY --from=builder /app/apps/admin/dist ./apps/admin/dist

# 迁移 + seed + 启动的入口脚本
COPY --chmod=755 scripts/docker-entrypoint.sh /usr/local/bin/entrypoint.sh

# 非 root 用户跑 node
RUN addgroup -g 1001 nodejs && adduser -u 1001 -G nodejs -s /bin/sh -D nodejs \
 && chown -R nodejs:nodejs /app
USER nodejs

EXPOSE 3001

HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/api/ping >/dev/null || exit 1

ENTRYPOINT ["dumb-init", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["node", "apps/api/dist/src/main.js"]
