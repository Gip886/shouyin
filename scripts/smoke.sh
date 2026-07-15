#!/usr/bin/env bash
# scripts/smoke.sh — M1 端到端手动验证
# 用法：先 pnpm install && docker compose up -d && pnpm db:migrate && pnpm db:seed
# 然后启动 pnpm dev:api，最后跑本脚本

set -euo pipefail
API=${API:-http://localhost:3001/api}

blue() { printf '\033[1;34m▸ %s\033[0m\n' "$*"; }
green() { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
red() { printf '\033[1;31m✗ %s\033[0m\n' "$*"; }

blue "1) 登录 cashier"
TOKEN=$(curl -sS -X POST "$API/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"cashier","password":"cashier123"}' \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{console.log(JSON.parse(s).accessToken)})')
if [ -z "$TOKEN" ]; then red "登录失败"; exit 1; fi
green "已拿到 token: ${TOKEN:0:20}..."

AUTH="Authorization: Bearer $TOKEN"

blue "2) 扫已过期批次的商品 6901234567890 → 期待 code=EXPIRED"
curl -sS "$API/pos/scan/6901234567890" -H "$AUTH" | tee /tmp/scan.json
echo

blue "3) 查临期看板 → 应该看到红/黄档批次"
curl -sS "$API/batches/near-expiry?days=30" -H "$AUTH" | node -e '
let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{
  const arr = JSON.parse(s);
  console.log(`共 ${arr.length} 条`);
  arr.slice(0,5).forEach(b => console.log(`  ${b.urgency} ${b.productName} 批次${b.batchNo} 剩${b.daysLeft}天 数量${b.quantity}`));
});'

blue "4) 手动触发一次每日过期扫描"
curl -sS -X POST "$API/notifications/run-daily-scan" -H "$AUTH"
echo

green "冒烟通过。可用 http://localhost:8080 (adminer) 看数据库。"
