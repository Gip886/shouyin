import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * 加固版 JWT 守卫:
 *   1) 沿用 @Public() 白名单(login / ping 这类不用登录的接口)
 *   2) 支持 @Roles('ADMIN') 装饰器,限定角色。放在 handler 或整个 controller 上都行。
 *
 * 现有 categories/products/… 都不写 @Roles,行为跟改造前一致(登录即可用)。
 * 新加的 users 接口 controller 顶部整体标 @Roles('ADMIN'),员工登录也不能进。
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const authed = (await super.canActivate(context)) as boolean;
    if (!authed) return false;

    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const role = req.user?.role;
    if (!role || !required.includes(role)) {
      throw new ForbiddenException('没有权限');
    }
    return true;
  }
}

export interface CurrentUserPayload {
  userId: string;
  username: string;
  role: string;
}

import { createParamDecorator, SetMetadata } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserPayload => {
    const req = ctx.switchToHttp().getRequest();
    return req.user;
  },
);

// ── 角色装饰器 ──────────────────────────────────────────
// 用法:
//   @Roles('ADMIN')      整个 controller 或单个 handler 上限 admin
//   @Roles('ADMIN', 'STOCKER')  多个角色可访问
export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
