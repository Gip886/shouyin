import { Controller, Get, Query } from '@nestjs/common';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly svc: ReportsService) {}

  @Get('daily-sales')
  dailySales(@Query('days') days?: string) {
    const d = days ? Math.max(1, Math.min(90, Number(days))) : 14;
    return this.svc.dailySales(d);
  }

  @Get('stock-value')
  stockValue() {
    return this.svc.stockValue();
  }

  @Get('expiry-loss')
  expiryLoss() {
    return this.svc.expiryLoss();
  }

  @Get('recent-orders')
  recentOrders(@Query('limit') limit?: string) {
    return this.svc.recentOrders(limit ? Number(limit) : 50);
  }
}
