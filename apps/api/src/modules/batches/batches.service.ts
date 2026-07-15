import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BatchStatus, Prisma } from '@prisma/client';
import { NearExpiryBatch } from '@shouyin/shared';

/** 计算 UTC 语义下的今天零点，避免时区带来的 daysLeft 偏差 */
function todayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** date-only 减法，返回相差的整数天 */
export function diffDays(a: Date, b: Date): number {
  const MS = 1000 * 60 * 60 * 24;
  const da = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const db = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((da - db) / MS);
}

@Injectable()
export class BatchesService {
  constructor(private readonly prisma: PrismaService) {}

  /** 找 FIFO 首选批次：ACTIVE、有库存、离到期最近 */
  async findFifoBatch(productId: string) {
    return this.prisma.batch.findFirst({
      where: {
        productId,
        status: BatchStatus.ACTIVE,
        quantity: { gt: 0 },
      },
      orderBy: [{ expiryDate: 'asc' }, { receivedAt: 'asc' }],
    });
  }

  /** 单店库存汇总：每个 SKU 的总量 */
  async listWithStock(productId?: string) {
    const where: Prisma.BatchWhereInput = {
      status: BatchStatus.ACTIVE,
    };
    if (productId) where.productId = productId;
    return this.prisma.batch.findMany({
      where,
      include: { product: true },
      orderBy: [{ productId: 'asc' }, { expiryDate: 'asc' }],
    });
  }

  async findOne(id: string) {
    const b = await this.prisma.batch.findUnique({
      where: { id },
      include: { product: true },
    });
    if (!b) throw new NotFoundException('批次不存在');
    return b;
  }

  /** 入库新批次，同时写一条 IN 流水 */
  async create(
    operatorId: string,
    data: {
      productId: string;
      batchNo?: string;
      productionDate: string;
      expiryDate: string;
      quantity: number;
      costPrice: string;
    },
  ) {
    if (data.quantity <= 0) throw new BadRequestException('数量必须大于 0');
    const prod = await this.prisma.product.findUnique({
      where: { id: data.productId },
    });
    if (!prod) throw new NotFoundException('商品不存在');

    // 批次号自动生成：YYYYMMDD-短序号（同商品同天）
    let batchNo = data.batchNo?.trim();
    if (!batchNo) {
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const sameDay = await this.prisma.batch.count({
        where: {
          productId: data.productId,
          batchNo: { startsWith: stamp },
        },
      });
      batchNo = `${stamp}-${String(sameDay + 1).padStart(3, '0')}`;
    }

    const production = new Date(data.productionDate);
    const expiry = new Date(data.expiryDate);
    if (Number.isNaN(production.valueOf()) || Number.isNaN(expiry.valueOf())) {
      throw new BadRequestException('日期格式无效');
    }
    if (expiry.valueOf() < production.valueOf()) {
      throw new BadRequestException('到期日不能早于生产日');
    }

    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.batch.create({
        data: {
          productId: data.productId,
          batchNo,
          productionDate: production,
          expiryDate: expiry,
          quantity: data.quantity,
          initialQty: data.quantity,
          costPrice: data.costPrice,
        },
      });
      await tx.inventoryTxn.create({
        data: {
          batchId: batch.id,
          type: 'IN',
          qty: data.quantity,
          operatorId,
          reason: '入库',
        },
      });
      return batch;
    });
  }

  /**
   * 批量入库(供离线队列 replay 用)。
   * 逐条尝试,单条失败记 error 后继续,不使用大事务 —— 这样一条脏数据不会把
   * 已成功的都回滚,前端 replay 时可精准知道哪条失败并保留在本地重试。
   * 每条内部仍走 create() 的单条事务(批次 + 流水)。
   */
  async bulkCreate(
    operatorId: string,
    items: {
      productId: string;
      batchNo?: string;
      productionDate: string;
      expiryDate: string;
      quantity: number;
      costPrice: string;
    }[],
  ) {
    if (!items?.length) throw new BadRequestException('列表为空');
    const results: {
      index: number;
      ok: boolean;
      batchId?: string;
      batchNo?: string;
      error?: string;
    }[] = [];
    for (let i = 0; i < items.length; i++) {
      try {
        const b = await this.create(operatorId, items[i]);
        results.push({
          index: i,
          ok: true,
          batchId: b.id,
          batchNo: b.batchNo,
        });
      } catch (e: any) {
        const msg =
          Array.isArray(e?.response?.message)
            ? e.response.message.join('；')
            : e?.response?.message ?? e?.message ?? '入库失败';
        results.push({ index: i, ok: false, error: String(msg) });
      }
    }
    return {
      total: items.length,
      succeeded: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
  }

  /** 库存调整 / 报损。delta 正数增加、负数减少 */
  async adjust(
    operatorId: string,
    batchId: string,
    delta: number,
    reason: string,
  ) {
    if (delta === 0) throw new BadRequestException('调整数量不能为 0');
    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.batch.findUnique({ where: { id: batchId } });
      if (!batch) throw new NotFoundException('批次不存在');
      const next = batch.quantity + delta;
      if (next < 0) throw new BadRequestException('调整后数量不能为负');

      const updated = await tx.batch.update({
        where: { id: batchId },
        data: {
          quantity: next,
          status: next === 0 ? BatchStatus.DEPLETED : batch.status,
        },
      });
      await tx.inventoryTxn.create({
        data: {
          batchId,
          type: delta < 0 ? 'SCRAP' : 'ADJUST',
          qty: delta,
          reason,
          operatorId,
        },
      });
      return updated;
    });
  }

  /** 临期看板：默认返回 30 天内到期以及已过期未清理的批次 */
  async nearExpiry(days = 30): Promise<NearExpiryBatch[]> {
    const today = todayUtc();
    const horizon = new Date(today);
    horizon.setUTCDate(horizon.getUTCDate() + days);

    const rows = await this.prisma.batch.findMany({
      where: {
        status: BatchStatus.ACTIVE,
        quantity: { gt: 0 },
        expiryDate: { lte: horizon },
      },
      include: { product: true },
      orderBy: [{ expiryDate: 'asc' }],
    });

    return rows.map((b) => {
      const daysLeft = diffDays(b.expiryDate, today);
      const urgency: 'RED' | 'YELLOW' | 'GREEN' =
        daysLeft < 7 ? 'RED' : daysLeft <= 30 ? 'YELLOW' : 'GREEN';
      return {
        id: b.id,
        batchNo: b.batchNo,
        productId: b.productId,
        productName: b.product.name,
        barcode: b.product.barcode,
        productionDate: b.productionDate.toISOString().slice(0, 10),
        expiryDate: b.expiryDate.toISOString().slice(0, 10),
        daysLeft,
        quantity: b.quantity,
        costPrice: b.costPrice.toString(),
        urgency,
      };
    });
  }
}
