import { Controller, Get, Param, Query } from '@nestjs/common';
import { InventoryService } from './inventory.service';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly svc: InventoryService) {}

  @Get('txns')
  recent(@Query('limit') limit?: string) {
    return this.svc.recent(limit ? Number(limit) : 100);
  }

  @Get('batches/:id/txns')
  byBatch(@Param('id') id: string) {
    return this.svc.listByBatch(id);
  }
}
