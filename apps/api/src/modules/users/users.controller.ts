import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { CurrentUser, CurrentUserPayload, Roles } from '../auth/jwt-auth.guard';
import { UsersService } from './users.service';

/** 允许的角色。跟 Prisma schema 里的 Role enum 对齐。 */
const ROLES = ['ADMIN', 'CASHIER', 'STOCKER'] as const;
type Role = (typeof ROLES)[number];

class CreateUserDto {
  @IsString()
  @MinLength(2)
  username!: string;

  @IsString()
  @MinLength(1)
  displayName!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsOptional()
  @IsIn(ROLES as unknown as string[])
  role?: Role;
}

class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  displayName?: string;

  @IsOptional()
  @IsIn(ROLES as unknown as string[])
  role?: Role;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

class ResetPasswordDto {
  @IsString()
  @MinLength(6)
  password!: string;
}

class ChangePasswordDto {
  @IsString()
  oldPassword!: string;

  @IsString()
  @MinLength(6)
  newPassword!: string;
}

/**
 * 账号管理接口。除了 change-own-password 谁都能调之外,其他全部要 ADMIN 才能进。
 * 前端 admin 用来做"账号管理"页,POS/mobile 只调 me/change-password 让员工改自己的密码。
 */
@Controller('users')
export class UsersController {
  constructor(private readonly svc: UsersService) {}

  // ── 需要 ADMIN 才能调 ─────────────────────────────
  @Roles('ADMIN')
  @Get()
  list() {
    return this.svc.list();
  }

  @Roles('ADMIN')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Roles('ADMIN')
  @Post()
  create(@Body() body: CreateUserDto) {
    return this.svc.create(body);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateUserDto,
    @CurrentUser() me: CurrentUserPayload,
  ) {
    return this.svc.update(id, me.userId, body);
  }

  @Roles('ADMIN')
  @Post(':id/reset-password')
  resetPassword(@Param('id') id: string, @Body() body: ResetPasswordDto) {
    return this.svc.resetPassword(id, body.password);
  }

  // ── 谁登录都能调(改自己密码) ─────────────────────
  @Post('me/change-password')
  changeOwnPassword(
    @Body() body: ChangePasswordDto,
    @CurrentUser() me: CurrentUserPayload,
  ) {
    return this.svc.changeOwnPassword(me.userId, body.oldPassword, body.newPassword);
  }
}
