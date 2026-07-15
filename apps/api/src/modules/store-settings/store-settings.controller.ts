import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { StoreSettingsService } from './store-settings.service';

class UpdateStoreSettingsDto {
  @IsOptional() @IsString() @MaxLength(64) storeName?: string;
  @IsOptional() @IsString() @MaxLength(200) address?: string;
  @IsOptional() @IsString() @MaxLength(32) phone?: string;
  @IsOptional() @IsString() @MaxLength(32) taxId?: string;
  @IsOptional() @IsString() @MaxLength(120) receiptFooter?: string;
  @IsOptional() @IsInt() @IsIn([58, 80]) receiptWidthMm?: number;
  @IsOptional() @IsBoolean() autoPrintReceipt?: boolean;
  @IsOptional() @IsBoolean() allowBrowserPrint?: boolean;
}

@Controller('store-settings')
export class StoreSettingsController {
  constructor(private readonly svc: StoreSettingsService) {}

  @Get()
  get() {
    return this.svc.get();
  }

  @Patch()
  update(@Body() body: UpdateStoreSettingsDto) {
    return this.svc.update(body);
  }
}
