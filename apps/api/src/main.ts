import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: {
      // 允许:
      //  - 本机 dev(admin 5173 / pos 5174 / mobile 5175 / vite preview)
      //  - Capacitor Android WebView(androidScheme=http → origin http://localhost)
      //  - Capacitor iOS(如果以后做)
      //  - 局域网 IP 上跑起来的同一份前端(比如把 dist 挂到 nginx 上分发到手机浏览器)
      origin: [
        /^https?:\/\/localhost(:\d+)?$/,
        'capacitor://localhost',
        /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
        /^https?:\/\/192\.168\.\d+\.\d+(:\d+)?$/,
        /^https?:\/\/10\.\d+\.\d+\.\d+(:\d+)?$/,
        /^https?:\/\/172\.(1[6-9]|2\d|3[01])\.\d+\.\d+(:\d+)?$/,
      ],
      credentials: true,
    },
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );
  const port = Number(process.env.PORT ?? 3001);
  // 显式监听 0.0.0.0,让局域网手机能连过来(默认已经是 0.0.0.0,写死更保险)
  await app.listen(port, '0.0.0.0');
  Logger.log(`🚀 API 已启动 http://localhost:${port}/api`, 'Bootstrap');
}
bootstrap();
