import { Capacitor } from '@capacitor/core';
import WebScanner from './WebScanner';
import NativeScanner from './NativeScanner';

export interface ScannerProps {
  /** 识别到条码后回调,组件内部会停一次,由父组件决定是否重新 start */
  onDetected: (code: string) => void;
  /** 挂载后立即启动扫码。web 上 iOS Safari 需要用户手势,默认 false */
  autoStart?: boolean;
  /** 允许手动输入条码作为兜底 */
  showManualInput?: boolean;
}

/**
 * 双通道 Scanner:
 * - APK(Capacitor):走原生 ML Kit,弹全屏扫码 UI,速度和识别率都靠 Google Play Services
 * - 浏览器:走 zxing-js,页面内 <video>,方便桌面开发调试
 * 对外接口一致(props/回调),调用方不用关心平台
 */
export default function Scanner(props: ScannerProps) {
  if (Capacitor.isNativePlatform()) {
    return <NativeScanner {...props} />;
  }
  return <WebScanner {...props} />;
}
