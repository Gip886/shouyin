import { Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  @Get()
  list(@Query('unreadOnly') unreadOnly?: string) {
    return this.svc.list(unreadOnly === 'true');
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string) {
    return this.svc.markRead(id);
  }

  /** 手动触发一次每日扫描，方便调试 */
  @Post('run-daily-scan')
  runDaily() {
    return this.svc.runDailyScan();
  }
}
