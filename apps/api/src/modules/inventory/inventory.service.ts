import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  /** 查看某批次的历史流水 */
  listByBatch(batchId: string) {
    return this.prisma.inventoryTxn.findMany({
      where: { batchId },
      orderBy: { createdAt: 'desc' },
      include: { operator: { select: { username: true, displayName: true } } },
    });
  }

  /** 最近若干条流水（后台监控用） */
  recent(limit = 100) {
    return this.prisma.inventoryTxn.findMany({
      take: Math.min(500, limit),
      orderBy: { createdAt: 'desc' },
      include: {
        batch: {
          include: { product: { select: { name: true, barcode: true } } },
        },
        operator: { select: { username: true, displayName: true } },
      },
    });
  }
}
