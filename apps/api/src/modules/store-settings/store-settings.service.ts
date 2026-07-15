import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 店铺配置(单例)。
 * 表里永远只有一行(id="default"),用 upsert 保证幂等。
 */
@Injectable()
export class StoreSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly SINGLETON_ID = 'default';

  async get() {
    return this.prisma.storeSettings.upsert({
      where: { id: this.SINGLETON_ID },
      create: { id: this.SINGLETON_ID },
      update: {},
    });
  }

  async update(data: {
    storeName?: string;
    address?: string;
    phone?: string;
    taxId?: string;
    receiptFooter?: string;
    receiptWidthMm?: number;
    autoPrintReceipt?: boolean;
    allowBrowserPrint?: boolean;
  }) {
    return this.prisma.storeSettings.upsert({
      where: { id: this.SINGLETON_ID },
      create: { id: this.SINGLETON_ID, ...data },
      update: data,
    });
  }
}
