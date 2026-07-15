import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  // Capacitor 打成 APK 后从 http://localhost/ 加载 index.html,
  // 必须用相对路径引资源,不然 /assets/... 会 404
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5175,
    // 手机在同 Wi-Fi 里访问电脑上的开发服务器
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
