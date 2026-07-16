import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { CategoriesService } from './categories.service';

class UpsertCategoryDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  nearExpiryDays?: number;

  @IsOptional()
  @IsBoolean()
  hasExpiry?: boolean;
}

class CreateCategoryDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  nearExpiryDays?: number;

  @IsOptional()
  @IsBoolean()
  hasExpiry?: boolean;
}

@Controller('categories')
export class CategoriesController {
  constructor(private readonly svc: CategoriesService) {}

  @Get()
  list() {
    return this.svc.list();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Post()
  create(@Body() body: CreateCategoryDto) {
    return this.svc.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpsertCategoryDto) {
    return this.svc.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }
}
