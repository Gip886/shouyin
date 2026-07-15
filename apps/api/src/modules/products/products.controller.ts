import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  IsBoolean,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ProductsService } from './products.service';

class CreateProductDto {
  @IsString() barcode!: string;
  @IsString() name!: string;
  @IsString() categoryId!: string;
  @IsOptional() @IsString() unit?: string;
  @IsNumberString() salePrice!: string;
  @IsNumberString() costPrice!: string;
  @IsOptional() @IsInt() @Min(0) nearExpiryDays?: number;
}

class UpdateProductDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsNumberString() salePrice?: string;
  @IsOptional() @IsNumberString() costPrice?: string;
  @IsOptional() @IsInt() @Min(0) nearExpiryDays?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@Controller('products')
export class ProductsController {
  constructor(private readonly svc: ProductsService) {}

  @Get()
  list(
    @Query('q') q?: string,
    @Query('categoryId') categoryId?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.svc.list({
      q,
      categoryId,
      isActive: isActive === undefined ? undefined : isActive === 'true',
    });
  }

  @Get('by-barcode/:barcode')
  byBarcode(@Param('barcode') barcode: string) {
    return this.svc.findByBarcode(barcode);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Post()
  create(@Body() body: CreateProductDto) {
    return this.svc.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateProductDto) {
    return this.svc.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }
}
