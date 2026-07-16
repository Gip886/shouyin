import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { BatchesService, diffDays } from '../batches/batches.service';
import { BatchStatus, Prisma } from '@prisma/client';

function todayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly batches: BatchesService,
  ) {}

  /** 每天凌晨 2 点跑一次 */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async dailyExpiryScan() {
    await this.runDailyScan();
  }

  /** 抽出成独立方法便于手动触发 */
  async runDailyScan() {
    const today = todayUtc();
    // 已过期但仍在售的批次 → 标记为 EXPIRED_REMOVED（不自动改数量，等人工报损）
    // 只扫有保质期的品类;文具/日用品这些永远不该被"过期下架"
    const expired = await this.prisma.batch.findMany({
      where: {
        status: BatchStatus.ACTIVE,
        quantity: { gt: 0 },
        expiryDate: { lt: today },
        product: { category: { hasExpiry: true } },
      },
      include: { product: true },
    });

    if (expired.length > 0) {
      await this.prisma.batch.updateMany({
        where: { id: { in: expired.map((b) => b.id) } },
        data: { status: BatchStatus.EXPIRED_REMOVED },
      });
    }

    // 未来 7 天内到期的
    const nearExpiry = await this.batches.nearExpiry(7);

    await this.prisma.notification.create({
      data: {
        kind: 'DAILY_EXPIRY_REPORT',
        title: `每日临期报告 · ${today.toISOString().slice(0, 10)}`,
        body: `已过期 ${expired.length} 个批次，7 天内到期 ${nearExpiry.length} 个批次`,
        payload: {
          expired: expired.map((b) => ({
            id: b.id,
            batchNo: b.batchNo,
            productName: b.product.name,
            quantity: b.quantity,
            // 过滤条件保证了 expiryDate 不为 null,! 安全
            daysOverdue: -diffDays(b.expiryDate!, today),
          })),
          nearExpiry: nearExpiry,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    this.logger.log(
      `每日扫描完成：过期 ${expired.length}，临期 ${nearExpiry.length}`,
    );
    return { expired: expired.length, nearExpiry: nearExpiry.length };
  }

  list(unreadOnly = false) {
    return this.prisma.notification.findMany({
      where: unreadOnly ? { readAt: null } : {},
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  markRead(id: string) {
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }
}
