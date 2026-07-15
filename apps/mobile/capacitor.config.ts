import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor 打包配置。
 *
 * 设计要点:
 * - androidScheme='http' 让 WebView 页面 origin 变成 http://localhost,
 *   这样对局域网 http 后端(比如 http://192.168.1.42:3001)的 XHR 不会被判为
 *   mixed content 阻断。allowMixedContent 做双保险。
 * - webDir='dist' 对应 vite build 产物。
 * - 生产 APK 不设 server.url;开发时如果要 hot-reload,临时加
 *   server: { url: 'http://192.168.x.x:5175', cleartext: true }
 *
 * 服务器地址不放在这里 —— 员工自己扫 QR 得到,写进 @capacitor/preferences。
 */
const config: CapacitorConfig = {
  appId: 'com.shouyin.mobile',
  appName: '收银库存',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
  },
  server: {
    androidScheme: 'http',
  },
};

export default config;
