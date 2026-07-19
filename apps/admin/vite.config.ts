import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// base 用函数式:build 时 '/admin/'(生产由 NestJS 挂 /admin 前缀托管,单机一体化,见 apps/api/src/main.ts),
// dev 时 '/'(本地跑 vite 5173 不受影响)。
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/admin/' : '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
}));
