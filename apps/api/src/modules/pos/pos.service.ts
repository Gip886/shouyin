import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import Decimal from 'decimal.js';
import { PrismaService } from '../prisma/prisma.service';
import { BatchesService, diffDays } from '../batches/batches.service';
import {
  BatchStatus,
  PaymentMethod as DbPaymentMethod,
} from '@prisma/client';
import {
  CheckoutRequest,
  CheckoutResult,
  ScanCode,
  ScanResult,
} from '@shouyin/shared';

/** 今天 UTC 零点 */
function todayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

@Injectable()
export class PosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly batches: BatchesService,
  ) {}

  /**
   * 扫码：
   * 1. 找商品；2. FIFO 找批次；3. 判定过期 / 临期。
   * 已过期批次仍会返回（前端可据此下架），但 code=EXPIRED。
   */
  async scan(barcode: string): Promise<ScanResult> {
    const product = await this.prisma.product.findUnique({
      where: { barcode },
      include: { category: true },
    });
    if (!product || !product.isActive) {
      return { code: ScanCode.NOT_FOUND, message: `未找到商品：${barcode}` };
    }

    // FIFO 优先，但过期批次也纳入 —— 有的话前端可选择跳过卖下一个批次
    const batch = await this.prisma.batch.findFirst({
      where: {
        productId: product.id,
        status: BatchStatus.ACTIVE,
        quantity: { gt: 0 },
      },
      orderBy: [{ expiryDate: 'asc' }, { receivedAt: 'asc' }],
    });

    if (!batch) {
      return {
        code: ScanCode.OUT_OF_STOCK,
        message: '该商品已无库存',
        product: this.productDto(product),
      };
    }

    const daysLeft = diffDays(batch.expiryDate, todayUtc());
    const threshold =
      product.nearExpiryDays ?? product.category.nearExpiryDays ?? 30;

    let code: ScanCode = ScanCode.OK;
    let message = '';
    if (daysLeft < 0) {
      code = ScanCode.EXPIRED;
      message = `此批次已过期 ${-daysLeft} 天，禁止销售`;
    } else if (daysLeft <= threshold) {
      code = ScanCode.NEAR_EXPIRY;
      message = `此批次将在 ${daysLeft} 天后过期，请确认后再销售`;
    }

    return {
      code,
      message,
      product: this.productDto(product),
      batch: {
        id: batch.id,
        batchNo: batch.batchNo,
        productionDate: batch.productionDate.toISOString().slice(0, 10),
        expiryDate: batch.expiryDate.toISOString().slice(0, 10),
        quantity: batch.quantity,
        daysLeft,
      },
    };
  }

  private productDto(p: {
    id: string;
    barcode: string;
    name: string;
    unit: string;
    salePrice: unknown;
  }) {
    return {
      id: p.id,
      barcode: p.barcode,
      name: p.name,
      unit: p.unit,
      salePrice: String(p.salePrice),
    };
  }

  /**
   * 结账事务：
   * - 一次事务锁定所有批次；
   * - 逐个批次校验库存与状态、允许过期批次的兜底拒绝；
   * - 扣减库存、写销售流水、写订单。
   */
  async checkout(
    cashierId: string,
    body: CheckoutRequest,
  ): Promise<CheckoutResult> {
    if (!body.items?.length) throw new BadRequestException('购物车为空');

    return this.prisma.$transaction(async (tx) => {
      let total = new Decimal(0);
      const orderItemsData: {
        productId: string;
        batchId: string;
        qty: number;
        unitPrice: string;
        subtotal: string;
      }[] = [];
      const txnDrafts: { batchId: string; qty: number }[] = [];

      for (const item of body.items) {
        if (item.qty <= 0) throw new BadRequestException('数量必须大于 0');

        // FOR UPDATE 锁行防止并发超卖。Prisma 通过 $queryRaw 拿锁。
        const rows = await tx.$queryRaw<
          { id: string; product_id: string; quantity: number; status: BatchStatus; expiry_date: Date }[]
        >`SELECT id, "productId" AS product_id, quantity, status, "expiryDate" AS expiry_date
          FROM "Batch" WHERE id = ${item.batchId} FOR UPDATE`;
        const row = rows[0];
        if (!row) throw new NotFoundException(`批次不存在: ${item.batchId}`);

        if (row.status !== BatchStatus.ACTIVE) {
          throw new ConflictException(`批次不可售: ${item.batchId}`);
        }
        if (row.expiry_date.valueOf() < todayUtc().valueOf()) {
          throw new ConflictException(`批次已过期，拒绝结账: ${item.batchId}`);
        }
        if (row.quantity < item.qty) {
          throw new ConflictException(
            `批次库存不足：需要 ${item.qty}，剩 ${row.quantity}`,
          );
        }

        const price = new Decimal(item.unitPrice);
        const sub = price.mul(item.qty);
        total = total.plus(sub);

        const next = row.quantity - item.qty;
        await tx.batch.update({
          where: { id: item.batchId },
          data: {
            quantity: next,
            status: next === 0 ? BatchStatus.DEPLETED : BatchStatus.ACTIVE,
          },
        });

        orderItemsData.push({
          productId: row.product_id,
          batchId: item.batchId,
          qty: item.qty,
          unitPrice: price.toFixed(2),
          subtotal: sub.toFixed(2),
        });
        txnDrafts.push({ batchId: item.batchId, qty: item.qty });
      }

      const paid = new Decimal(body.paidAmount);
      if (paid.lt(total)) {
        throw new BadRequestException(
          `实收金额不足：应收 ${total.toFixed(2)}，实收 ${paid.toFixed(2)}`,
        );
      }

      const order = await tx.order.create({
        data: {
          cashierId,
          totalAmount: total.toFixed(2),
          paidAmount: paid.toFixed(2),
          paymentMethod: body.paymentMethod as DbPaymentMethod,
          items: { create: orderItemsData },
        },
      });

      // 已知 orderId 再写销售流水，无需回填
      await tx.inventoryTxn.createMany({
        data: txnDrafts.map((d) => ({
          batchId: d.batchId,
          type: 'SALE',
          qty: -d.qty,
          operatorId: cashierId,
          orderId: order.id,
        })),
      });

      return {
        orderId: order.id,
        totalAmount: total.toFixed(2),
        change: paid.minus(total).toFixed(2),
      };
    });
  }
}
