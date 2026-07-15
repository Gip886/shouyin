import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumberString,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PosService } from './pos.service';
import { CurrentUser, CurrentUserPayload } from '../auth/jwt-auth.guard';

class CheckoutItemDto {
  @IsString() batchId!: string;
  @IsInt() @Min(1) qty!: number;
  @IsNumberString() unitPrice!: string;
}

class CheckoutDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CheckoutItemDto)
  items!: CheckoutItemDto[];

  @IsNumberString() paidAmount!: string;

  @IsEnum(['CASH', 'WECHAT', 'ALIPAY'])
  paymentMethod!: 'CASH' | 'WECHAT' | 'ALIPAY';
}

@Controller('pos')
export class PosController {
  constructor(private readonly svc: PosService) {}

  @Get('scan/:barcode')
  scan(@Param('barcode') barcode: string) {
    return this.svc.scan(barcode);
  }

  @Post('checkout')
  checkout(
    @CurrentUser() u: CurrentUserPayload,
    @Body() body: CheckoutDto,
  ) {
    return this.svc.checkout(u.userId, body);
  }
}
