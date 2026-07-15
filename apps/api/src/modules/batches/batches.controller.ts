import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { BatchesService } from './batches.service';
import { CurrentUser, CurrentUserPayload } from '../auth/jwt-auth.guard';

class CreateBatchDto {
  @IsString() productId!: string;
  @IsOptional() @IsString() batchNo?: string;
  @IsString() productionDate!: string; // YYYY-MM-DD
  @IsString() expiryDate!: string;
  @IsInt() @Min(1) quantity!: number;
  @IsNumberString() costPrice!: string;
}

class AdjustDto {
  @IsInt() delta!: number;
  @IsString() reason!: string;
}

@Controller('batches')
export class BatchesController {
  constructor(private readonly svc: BatchesService) {}

  @Get()
  list(@Query('productId') productId?: string) {
    return this.svc.listWithStock(productId);
  }

  @Get('near-expiry')
  nearExpiry(@Query('days') days?: string) {
    const d = days ? Math.max(1, Math.min(365, Number(days))) : 30;
    return this.svc.nearExpiry(d);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Post()
  create(@CurrentUser() u: CurrentUserPayload, @Body() body: CreateBatchDto) {
    return this.svc.create(u.userId, body);
  }

  @Post(':id/adjust')
  adjust(
    @CurrentUser() u: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: AdjustDto,
  ) {
    return this.svc.adjust(u.userId, id, body.delta, body.reason);
  }
}
