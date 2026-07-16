import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.category.findMany({ orderBy: { createdAt: 'asc' } });
  }

  async findOne(id: string) {
    const c = await this.prisma.category.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('品类不存在');
    return c;
  }

  create(data: { name: string; nearExpiryDays?: number; hasExpiry?: boolean }) {
    return this.prisma.category.create({
      data: {
        name: data.name,
        nearExpiryDays: data.nearExpiryDays ?? 30,
        hasExpiry: data.hasExpiry ?? true,
      },
    });
  }

  update(
    id: string,
    data: { name?: string; nearExpiryDays?: number; hasExpiry?: boolean },
  ) {
    return this.prisma.category.update({ where: { id }, data });
  }

  remove(id: string) {
    return this.prisma.category.delete({ where: { id } });
  }
}
