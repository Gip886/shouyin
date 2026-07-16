import { Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { BatchStatus, TxnType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 每日销售汇总：按 createdAt 分组，返回过去 N 天的每日营业额、订单数、售出件数。
   */
  async dailySales(days = 14) {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - days + 1);

    // Prisma 无内置 date_trunc，用 raw 更直接
    const rows = await this.prisma.$queryRaw<
      { day: Date; orders: bigint; total: string; qty: bigint }[]
    >`SELECT
        date_trunc('day', o."createdAt") AS day,
        COUNT(DISTINCT o.id)::bigint AS orders,
        COALESCE(SUM(o."totalAmount"), 0)::text AS total,
        COALESCE(SUM(oi.qty), 0)::bigint AS qty
      FROM "Order" o
      LEFT JOIN "OrderItem" oi ON oi."orderId" = o.id
      WHERE o."createdAt" >= ${since}
      GROUP BY 1
      ORDER BY 1 ASC`;

    return rows.map((r) => ({
      day: r.day.toISOString().slice(0, 10),
      orders: Number(r.orders),
      total: r.total,
      qty: Number(r.qty),
    }));
  }

  /**
   * 库存价值：所有 ACTIVE 批次的 quantity × costPrice 之和，另外分品类聚合。
   */
  async stockValue() {
    const batches = await this.prisma.batch.findMany({
      where: { status: BatchStatus.ACTIVE, quantity: { gt: 0 } },
      include: {
        product: { include: { category: true } },
      },
    });

    let totalValue = new Decimal(0);
    let totalSku = 0;
    let totalQty = 0;
    const byCategory = new Map<
      string,
      { categoryName: string; value: Decimal; qty: number }
    >();

    for (const b of batches) {
      const value = new Decimal(b.costPrice.toString()).mul(b.quantity);
      totalValue = totalValue.plus(value);
      totalQty += b.quantity;
      totalSku++;

      const cid = b.product.categoryId;
      const cur = byCategory.get(cid) ?? {
        categoryName: b.product.category.name,
        value: new Decimal(0),
        qty: 0,
      };
      cur.value = cur.value.plus(value);
      cur.qty += b.quantity;
      byCategory.set(cid, cur);
    }

    return {
      totalValue: totalValue.toFixed(2),
      totalQty,
      totalBatches: totalSku,
      byCategory: [...byCategory.values()].map((c) => ({
        categoryName: c.categoryName,
        value: c.value.toFixed(2),
        qty: c.qty,
      })),
    };
  }

  /**
   * 已过期损失预估：quantity × costPrice 汇总，用于「潜在损失」告警。
   */
  async expiryLoss() {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const batches = await this.prisma.batch.findMany({
      where: {
        quantity: { gt: 0 },
        expiryDate: { lt: today },
        // 只统计有保质期品类的过期损失
        product: { category: { hasExpiry: true } },
        // 已过期批次（无论 status 是不是 EXPIRED_REMOVED）都是潜在损失
      },
    });

    let loss = new Decimal(0);
    for (const b of batches) {
      loss = loss.plus(new Decimal(b.costPrice.toString()).mul(b.quantity));
    }
    return {
      batches: batches.length,
      loss: loss.toFixed(2),
    };
  }

  /**
   * 最近订单：可用于订单流水页
   */
  recentOrders(limit = 50) {
    return this.prisma.order.findMany({
      take: Math.min(200, limit),
      orderBy: { createdAt: 'desc' },
      include: {
        cashier: { select: { username: true, displayName: true } },
        items: {
          include: {
            product: { select: { name: true, barcode: true, unit: true } },
          },
        },
      },
    });
  }
}
