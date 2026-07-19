import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Request, Response, NextFunction, Express } from 'express';

/**
 * 把一个 vite build 出来的 SPA 挂到指定 URL 前缀下。
 *
 * 三个中间件的顺序是有讲究的:
 *   1) SPA fallback(GET /prefix/* 且没有扩展名) → 返回 index.html
 *      放在最前,防止 Nest 的 404 handler 或 static 的 index 抢答。
 *   2) useStaticAssets(prefix)                   → 命中就返回文件,没命中 fallthrough
 *   3) 什么都没命中 → 走到 Nest,该 404 就 404(资源真的缺失,不假装)
 *
 * @param prefix 挂载前缀,如 '/pos' '/admin',不带尾斜杠
 * @param dist   dist 目录绝对路径,需含 index.html
 */
function mountSpa(
  app: NestExpressApplication,
  expressApp: Express,
  prefix: string,
  dist: string,
) {
  // 用带前缀的正则匹配 /pos、/pos/、/pos/anything...
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const spaRegex = new RegExp(`^${escaped}(/.*)?$`);
  expressApp.get(spaRegex, (req: Request, res: Response, next: NextFunction) => {
    // 只处理 HTML 导航;带扩展名的走静态资源,资源真缺就 404,别假装
    if (/\.[a-z0-9]+$/i.test(req.path)) return next();
    res.sendFile(join(dist, 'index.html'));
  });
  app.useStaticAssets(dist, {
    prefix,
    index: false,
    maxAge: '1h',
  });
}

/**
 * 在几个候选目录里找第一个有 index.html 的,当作前端 dist。
 * 优先级:环境变量 > __dirname 反推(打包后的相对布局) > CWD 相对(不同工作目录启动兜底)。
 */
function resolveDist(envVar: string | undefined, ...relativeFromDirname: string[][]): string | null {
  const candidates = [
    envVar,
    ...relativeFromDirname.map((parts) => resolve(__dirname, ...parts)),
  ].filter(Boolean) as string[];
  return candidates.find((p) => existsSync(join(p, 'index.html'))) ?? null;
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
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

  // ── 一体化部署:后端同时托管 POS 和 admin 两个前端 ────────────────────────
  // 单机装机场景下这台电脑要同时跑 API、收银台、后台管理。跑一个 node 进程,
  // 端口只开 3001,员工不用记 3 个地址,老板不用装 nginx。
  //
  // 路径规划:
  //   /api/*        → NestJS 路由(setGlobalPrefix('api'))
  //   /pos、/pos/*  → 收银台 SPA
  //   /admin、/*    → 管理后台 SPA
  //   /             → 302 到 /pos/(默认打开收银台;老板改地址栏进 /admin)
  //
  // dist 位置查找:环境变量优先,其次按 monorepo 布局反推(apps/api/dist/src/main.js)。
  const posDist = resolveDist(
    process.env.POS_DIST,
    ['..', '..', '..', '..', 'pos', 'dist'],   // apps/api/dist/src/main.js → apps/pos/dist
    ['..', '..', '..', 'pos', 'dist'],          // 备用:如果构建 outDir 变了
  );
  const adminDist = resolveDist(
    process.env.ADMIN_DIST,
    ['..', '..', '..', '..', 'admin', 'dist'],
    ['..', '..', '..', 'admin', 'dist'],
  );

  const expressApp = app.getHttpAdapter().getInstance();

  if (posDist) {
    mountSpa(app, expressApp, '/pos', posDist);
    Logger.log(`📦 已挂载 POS 前端: ${posDist} → /pos`, 'Bootstrap');
  } else {
    Logger.warn('未找到 POS 前端 dist,POS 路径将 404', 'Bootstrap');
  }

  if (adminDist) {
    mountSpa(app, expressApp, '/admin', adminDist);
    Logger.log(`📦 已挂载 admin 前端: ${adminDist} → /admin`, 'Bootstrap');
  } else {
    Logger.warn('未找到 admin 前端 dist,/admin 路径将 404', 'Bootstrap');
  }

  // 根路径 → /pos/,收银机开机第一屏。老板要进后台就自己加 /admin。
  // 只有 POS 存在时才转,避免"两个前端都没打包"的状态下把请求引到死路。
  if (posDist) {
    expressApp.get('/', (_req: Request, res: Response) => res.redirect('/pos/'));
  } else if (adminDist) {
    expressApp.get('/', (_req: Request, res: Response) => res.redirect('/admin/'));
  }
  // ────────────────────────────────────────────────────────────────────

  const port = Number(process.env.PORT ?? 3001);
  // 显式监听 0.0.0.0,让局域网手机能连过来(默认已经是 0.0.0.0,写死更保险)
  await app.listen(port, '0.0.0.0');
  Logger.log(`🚀 API 已启动 http://localhost:${port}/api`, 'Bootstrap');
  if (posDist) Logger.log(`🖥  收银台 http://localhost:${port}/pos`, 'Bootstrap');
  if (adminDist) Logger.log(`⚙  管理后台 http://localhost:${port}/admin`, 'Bootstrap');
}
bootstrap();
