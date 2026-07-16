// 种子数据：1 个管理员、1 个收银员、2 个品类、4 个 SKU、每个 SKU 3 个批次（过期/临期/正常）
// 使用：pnpm --filter @shouyin/api prisma db seed

import { PrismaClient, BatchStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/** 相对今天偏移 days 天的日期（YYYY-MM-DD 部分） */
function daysFromToday(days: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

async function main() {
  console.log('🌱 开始种子数据...');

  // 用户
  const adminPass = await bcrypt.hash('admin123', 10);
  const cashierPass = await bcrypt.hash('cashier123', 10);

  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      displayName: '管理员',
      passwordHash: adminPass,
      role: 'ADMIN',
    },
  });

  await prisma.user.upsert({
    where: { username: 'cashier' },
    update: {},
    create: {
      username: 'cashier',
      displayName: '收银员小李',
      passwordHash: cashierPass,
      role: 'CASHIER',
    },
  });

  // 品类
  const drinks = await prisma.category.upsert({
    where: { name: '饮料' },
    update: { hasExpiry: true },
    create: { name: '饮料', nearExpiryDays: 30, hasExpiry: true },
  });
  const snacks = await prisma.category.upsert({
    where: { name: '零食' },
    update: { hasExpiry: true },
    create: { name: '零食', nearExpiryDays: 45, hasExpiry: true },
  });
  // 无保质期示例:文具
  const stationery = await prisma.category.upsert({
    where: { name: '文具' },
    update: { hasExpiry: false },
    create: { name: '文具', nearExpiryDays: 0, hasExpiry: false },
  });

  // 商品
  const products = [
    {
      barcode: '6901234567890',
      name: '农夫山泉 550ml',
      category: drinks,
      unit: '瓶',
      salePrice: '2.50',
      costPrice: '1.20',
    },
    {
      barcode: '6902345678901',
      name: '可口可乐 330ml',
      category: drinks,
      unit: '罐',
      salePrice: '3.00',
      costPrice: '1.80',
    },
    {
      barcode: '6903456789012',
      name: '奥利奥饼干',
      category: snacks,
      unit: '包',
      salePrice: '8.90',
      costPrice: '5.20',
    },
    {
      barcode: '6904567890123',
      name: '乐事薯片原味',
      category: snacks,
      unit: '袋',
      salePrice: '6.50',
      costPrice: '3.80',
    },
    // 无保质期示例:一根中性笔
    {
      barcode: '6905000000001',
      name: '晨光中性笔 0.5mm',
      category: stationery,
      unit: '支',
      salePrice: '2.00',
      costPrice: '0.80',
    },
  ];

  for (const p of products) {
    const product = await prisma.product.upsert({
      where: { barcode: p.barcode },
      update: {},
      create: {
        barcode: p.barcode,
        name: p.name,
        categoryId: p.category.id,
        unit: p.unit,
        salePrice: p.salePrice,
        costPrice: p.costPrice,
      },
    });

    // 无保质期品类:入一个不带日期的批次演示
    if (!p.category.hasExpiry) {
      await prisma.batch.upsert({
        where: {
          productId_batchNo: { productId: product.id, batchNo: 'B-STOCK' },
        },
        update: {},
        create: {
          productId: product.id,
          batchNo: 'B-STOCK',
          productionDate: null,
          expiryDate: null,
          quantity: 100,
          initialQty: 100,
          costPrice: p.costPrice,
          status: BatchStatus.ACTIVE,
        },
      });
      continue;
    }

    // 每个 SKU 造 3 个批次：已过期 / 临期(3 天) / 正常(60 天)
    const scenarios = [
      { daysToExpiry: -5, batchNo: 'B-EXPIRED', qty: 10 },
      { daysToExpiry: 3, batchNo: 'B-NEAR', qty: 20 },
      { daysToExpiry: 60, batchNo: 'B-FRESH', qty: 50 },
    ];

    for (const s of scenarios) {
      await prisma.batch.upsert({
        where: {
          productId_batchNo: { productId: product.id, batchNo: s.batchNo },
        },
        update: {},
        create: {
          productId: product.id,
          batchNo: s.batchNo,
          // 假设保质期 180 天
          productionDate: daysFromToday(s.daysToExpiry - 180),
          expiryDate: daysFromToday(s.daysToExpiry),
          quantity: s.qty,
          initialQty: s.qty,
          costPrice: p.costPrice,
          status: BatchStatus.ACTIVE,
        },
      });
    }
  }

  console.log('✅ 种子数据完成');
  console.log('   登录：admin/admin123，cashier/cashier123');
  console.log(`   管理员ID: ${admin.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
