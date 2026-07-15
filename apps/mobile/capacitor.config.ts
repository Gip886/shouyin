import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor 打包配置。
 *
 * 设计要点:
 * - androidScheme='http' 让 WebView 页面 origin 变成 http://localhost,
 *   对局域网 http 后端的 XHR 不会被判为 mixed content
 * - allowMixedContent: 双保险,处理 https 页面 → http 请求场景
 * - server.cleartext=true + AndroidManifest usesCleartextTraffic=true:
 *   Android 9+ 默认禁明文,必须显式打开。生产 http 局域网后端必须开
 * - webDir='dist' 对应 vite build 产物
 * - 生产 APK 不设 server.url;开发要 hot-reload 才临时加
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
    cleartext: true,
  },
};

export default config;
