import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/public.decorator';

/**
 * 探活端点:公开、无需鉴权。
 * - 用作移动端 APK 首次配置时"这个地址真的是收银 API 吗"的校验
 * - 也用作移动端 useOnlineStatus 的 15s 心跳(原来打的 /store-settings 需要 JWT,登录前用不了)
 * 返回体保持简单:员工扫的 QR → ping 通 → 显示 name,让管理员一眼看出扫对了没
 */
@Controller('ping')
export class HealthController {
  @Public()
  @Get()
  ping() {
    return {
      ok: true,
      name: '收银 API',
      version: '1',
      time: Date.now(),
    };
  }
}
