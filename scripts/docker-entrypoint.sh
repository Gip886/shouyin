#!/bin/sh
# ═══════════════════════════════════════════════════════════════════
#  容器启动前的自动化步骤:
#    1) 等 DB 就绪(compose 里 depends_on healthcheck 已经保证了,但双保险)
#    2) 跑 prisma migrate deploy —— 幂等,首次建表、后续升级 schema 都走这里
#    3) 首次运行(User 表为空)自动 seed;之后跳过
#    4) exec 到 CMD
#
#  为什么把这些放在容器启动时而不是构建时:
#    · 数据库连接是运行时的信息(compose 里传的环境变量),构建时拿不到
#    · 数据库表本来就是"运行时状态",不应该焙进镜像
#    · 保证从零起容器时"docker compose up -d 一次就能用"
# ═══════════════════════════════════════════════════════════════════
set -e

cd /app

echo "[entrypoint] 等待数据库就绪..."
# compose 的 depends_on service_healthy 已经保证 pg 起来了,这里再探活一次做双保险。
# 加超时防止 DB 真起不来时容器无限循环。
for i in $(seq 1 30); do
  if node -e "const{PrismaClient}=require('/app/apps/api/node_modules/@prisma/client');const p=new PrismaClient();p.\$queryRawUnsafe('SELECT 1').then(()=>process.exit(0)).catch(()=>process.exit(1))" 2>/dev/null; then
    echo "[entrypoint] 数据库连通 ✓"
    break
  fi
  echo "[entrypoint] 数据库还没起来,重试 ($i/30)..."
  sleep 2
done

echo "[entrypoint] 应用数据库 schema..."
# 项目还没建 migrations 目录(纯用 db push 迭代),这里也用 db push:
#   --skip-generate 因为构建时已经 generate 过了,不需要重复
#   --accept-data-loss 让脚本非交互跑;首次建表不会真的丢数据,只是 Prisma 保守提示
# 首次运行会建表,后续 schema 有 additive 变更(加字段、加索引)也能自动 apply。
# 破坏性变更(改字段类型、删字段)在生产环境不该发生 —— 我们通过前面兼容层设计避开。
node apps/api/node_modules/prisma/build/index.js db push \
  --schema apps/api/prisma/schema.prisma \
  --skip-generate \
  --accept-data-loss

# 首次启动(User 表为空)自动 seed。之后不重跑(避免覆盖运营数据)。
# 想强制 reseed:docker compose down -v 清空 volume 再 up。
USER_COUNT=$(node -e "const{PrismaClient}=require('/app/apps/api/node_modules/@prisma/client');const p=new PrismaClient();p.user.count().then(n=>{console.log(n);process.exit(0)}).catch(()=>{console.log(-1);process.exit(0)})")
if [ "$USER_COUNT" = "0" ]; then
  echo "[entrypoint] User 表为空,执行首次 seed..."
  if [ -f apps/api/dist/prisma/seed.js ]; then
    node apps/api/dist/prisma/seed.js
  else
    echo "[entrypoint] 找不到 apps/api/dist/prisma/seed.js,跳过 seed。"
  fi
else
  echo "[entrypoint] User 表已有 $USER_COUNT 条数据,跳过 seed(想强制重来:docker compose down -v)"
fi

echo "[entrypoint] 启动 API..."
exec "$@"
