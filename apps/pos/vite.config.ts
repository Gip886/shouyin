import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// base 用函数形式:build 时用 '/pos/'(生产由 NestJS 挂 /pos 前缀托管),dev 时用 '/'(本地跑 vite 5174 不受影响)。
// 详见 apps/api/src/main.ts 的 useStaticAssets 挂载点。
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/pos/' : '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
}));
