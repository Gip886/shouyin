# 收银系统 · 单店版（批次级过期管理）

面向便利店/小超市的收银系统，围绕**批次级保质期管理**这一核心痛点设计：进货录入生产日期和保质期后，收银端扫码即时校验，过期直接拦截、临期弹窗警告；后台/移动端有临期看板，进货、盘点、库存调整都能在手机上完成。

## 架构

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│  admin (Web)│     │  pos (Web)  │     │ mobile (H5)  │
└──────┬──────┘     └──────┬──────┘     └──────┬───────┘
       │                   │                    │
       └───────────────────┼────────────────────┘
                           ▼
                  ┌────────────────┐
                  │  api (NestJS)  │  ← Prisma → PostgreSQL
                  └────────────────┘
```

技术栈：pnpm monorepo · NestJS 10 · Prisma 5 · PostgreSQL 16 · Docker Compose · React 18 + Vite（前端待做）。

目录：

```
├── apps/
│   ├── api/          # 后端（M1 已完成）
│   ├── admin/        # Web 后台（M2 已完成）
│   ├── pos/          # Web 收银（M3 已完成）
│   └── mobile/       # 移动端 H5（M4 已完成）
├── packages/
│   └── shared/       # 前后端共享类型
├── scripts/smoke.sh  # 端到端验证脚本
└── docker-compose.yml
```

## 快速开始

**前置：** Node 20+、pnpm 9+、Docker。

```bash
# 1. 安装依赖
pnpm install

# 2. 起数据库（Postgres + adminer）
cp .env.example .env
pnpm db:up

# 3. 建表 + 种数据
pnpm db:migrate     # 首次会问迁移名，输入 init
pnpm db:seed        # 造 4 个 SKU × 3 个批次（过期/临期/正常）

# 4. 启动 API
pnpm dev:api        # http://localhost:3001/api

# 5. 冒烟测试
./scripts/smoke.sh
```

数据库图形工具：http://localhost:8080  （adminer，服务器填 `postgres`）。

## 核心业务

### 批次策略（关键决策）

- **`Batch.expiryDate` 直接落库**（不是 `productionDate + shelfLifeDays` 动态算）
  - FIFO 查询走单列索引，性能好
  - 保质期规则改了不影响历史数据
- 录入时前端仍让用户填「生产日期 + 保质期天数」，提交前算好 `expiryDate`
- 一个 SKU 的多批次按 `expiryDate ASC` 排队，先卖到期近的（先进先出）

### 扫码逻辑（`GET /api/pos/scan/:barcode`）

```
1. 找商品，找 FIFO 首选批次
2. 判定 daysLeft = expiryDate - today：
   - < 0                → code=EXPIRED       拒绝
   - ≤ 品类/单品阈值    → code=NEAR_EXPIRY   前端弹二次确认
   - 否则               → code=OK
```

阈值优先级：`Product.nearExpiryDays` > `Category.nearExpiryDays`（默认 30 天）。

### 结账事务（`POST /api/pos/checkout`）

用 `SELECT ... FOR UPDATE` 锁批次行防止并发超卖，然后扣批次数量、写销售流水、写订单，全在一个事务里。

### 每日过期扫描

`@Cron` 每日 02:00：把已过期但仍在售的批次标 `EXPIRED_REMOVED`（**不自动扣库存**，只打标，等人工确认报损），并生成一条日报 Notification。可 `POST /api/notifications/run-daily-scan` 手动触发。

## 核心 API

| 接口 | 方法 | 说明 |
|---|---|---|
| `/auth/login` | POST | 登录，返回 JWT |
| `/pos/scan/:barcode` | GET | 扫码校验（含过期/临期判定） |
| `/pos/checkout` | POST | 结账（事务） |
| `/products` `/products/:id` | GET/POST/PATCH/DELETE | 商品 CRUD |
| `/categories` | GET/POST/PATCH/DELETE | 品类 CRUD |
| `/batches` | GET | 库存汇总 |
| `/batches/near-expiry?days=30` | GET | 临期看板 |
| `/batches` | POST | 入库新批次 |
| `/batches/:id/adjust` | POST | 库存调整/报损 |
| `/inventory/txns` | GET | 库存流水 |
| `/notifications` | GET | 通知列表 |

所有接口都要 `Authorization: Bearer <token>`，除 `/auth/login`。

## 默认账号

| 用户名 | 密码 | 角色 |
|---|---|---|
| admin | admin123 | ADMIN |
| cashier | cashier123 | CASHIER |

## 里程碑

- **M1 · 后端底座** ✅ 数据模型、认证、CRUD、扫码/结账、临期扫描
- **M2 · Web 后台** ✅ 商品/批次管理、临期看板、报表
- **M3 · Web 收银** ✅ 扫码枪监听、购物车、过期拦截 UI
- **M4 · 移动端 H5** ✅ 摄像头扫码入库、盘点、报损、临期看板

## 测试

```bash
pnpm --filter @shouyin/api test
```
