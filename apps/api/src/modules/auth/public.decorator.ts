import { SetMetadata } from '@nestjs/common';

// 用 @Public() 装饰跳过 JwtAuthGuard 的接口
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
