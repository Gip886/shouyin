import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ProductListQuery {
  q?: string;
  categoryId?: string;
  isActive?: boolean;
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  list(query: ProductListQuery = {}) {
    return this.prisma.product.findMany({
      where: {
        AND: [
          query.q
            ? {
                OR: [
                  { name: { contains: query.q, mode: 'insensitive' } },
                  { barcode: { contains: query.q } },
                ],
              }
            : {},
          query.categoryId ? { categoryId: query.categoryId } : {},
          query.isActive !== undefined ? { isActive: query.isActive } : {},
        ],
      },
      include: { category: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByBarcode(barcode: string) {
    return this.prisma.product.findUnique({
      where: { barcode },
      include: { category: true },
    });
  }

  async findOne(id: string) {
    const p = await this.prisma.product.findUnique({
      where: { id },
      include: { category: true },
    });
    if (!p) throw new NotFoundException('商品不存在');
    return p;
  }

  create(data: {
    barcode: string;
    name: string;
    categoryId: string;
    unit?: string;
    salePrice: string;
    costPrice: string;
    nearExpiryDays?: number;
  }) {
    return this.prisma.product.create({
      data: {
        barcode: data.barcode,
        name: data.name,
        categoryId: data.categoryId,
        unit: data.unit ?? '件',
        salePrice: data.salePrice,
        costPrice: data.costPrice,
        nearExpiryDays: data.nearExpiryDays,
      },
    });
  }

  update(
    id: string,
    data: Partial<{
      name: string;
      categoryId: string;
      unit: string;
      salePrice: string;
      costPrice: string;
      nearExpiryDays: number | null;
      isActive: boolean;
    }>,
  ) {
    return this.prisma.product.update({ where: { id }, data });
  }

  remove(id: string) {
    // 软删除：置为不可售
    return this.prisma.product.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
