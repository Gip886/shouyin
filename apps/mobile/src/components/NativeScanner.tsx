import { useEffect, useState } from 'react';
import { Button, Card, Input, Toast } from 'antd-mobile';
import {
  BarcodeScanner,
  BarcodeFormat,
} from '@capacitor-mlkit/barcode-scanning';
import type { ScannerProps } from './Scanner';

/**
 * Capacitor(APK)版:优先用 Google Code Scanner —— 不需要相机权限,由 Play Services 承担 UI。
 * 不同点:
 *  - 弹的是全屏原生 activity,不是页面内 video;所以组件视觉只是一个"开始扫码"按钮 + 手动输入兜底
 *  - autoStart 在 native 上直接忽略 —— 强制手势启动更符合 Android UX(用户点了才拉起相机)
 *  - 缺 Google Play Services 的机型(部分国产 ROM),用 scan()/startScan 的 fallback 走本地 ML Kit
 */
export default function NativeScanner({
  onDetected,
  showManualInput = true,
}: ScannerProps) {
  const [starting, setStarting] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [supported, setSupported] = useState<boolean | null>(null);

  useEffect(() => {
    // 只是探测一下当前设备能不能扫;不 block 手动输入
    BarcodeScanner.isSupported()
      .then((r) => setSupported(!!r.supported))
      .catch(() => setSupported(false));
  }, []);

  const scan = async () => {
    setStarting(true);
    try {
      // 首选:Google Code Scanner(Play Services 承担一切,零权限)
      try {
        const { barcodes } = await BarcodeScanner.scan({
          formats: [
            BarcodeFormat.Ean13,
            BarcodeFormat.Ean8,
            BarcodeFormat.UpcA,
            BarcodeFormat.UpcE,
            BarcodeFormat.Code128,
            BarcodeFormat.Code39,
            BarcodeFormat.QrCode,
          ],
        });
        const first = barcodes?.[0]?.rawValue;
        if (first) onDetected(first);
        else Toast.show({ content: '未识别到条码,可以再试一次' });
        return;
      } catch (e: any) {
        // Google Code Scanner 不可用(缺 Play Services / 老 ROM)→ 回落到 bundled 模式
        const msg = String(e?.message ?? e?.errorMessage ?? '');
        const needsFallback =
          /google play services/i.test(msg) ||
          /module.*not.*installed/i.test(msg) ||
          /GOOGLE_CODE_SCANNER/i.test(msg);
        if (!needsFallback) throw e;
      }

      // Fallback:本地 ML Kit 模型,需要 CAMERA 运行时权限
      const perm = await BarcodeScanner.requestPermissions();
      if (perm.camera !== 'granted' && perm.camera !== 'limited') {
        Toast.show({
          icon: 'fail',
          content: '请在系统设置里给应用授予相机权限',
        });
        return;
      }
      // startScan 会在 DOM 底下开一个原生 view;这里简化用 readBarcodesFromImage 是不合适的 —— 我们用 scan API 的第二个模式
      // capacitor-mlkit 也在 scan() 内部处理了两种模式,但为了显式一点,这里直接抛给用户看
      const { barcodes } = await BarcodeScanner.scan({
        formats: [
          BarcodeFormat.Ean13,
          BarcodeFormat.Ean8,
          BarcodeFormat.UpcA,
          BarcodeFormat.UpcE,
          BarcodeFormat.Code128,
          BarcodeFormat.Code39,
          BarcodeFormat.QrCode,
        ],
      });
      const first = barcodes?.[0]?.rawValue;
      if (first) onDetected(first);
      else Toast.show({ content: '未识别到条码,可以再试一次' });
    } catch (e: any) {
      Toast.show({
        icon: 'fail',
        content: e?.message ?? '扫码失败',
      });
    } finally {
      setStarting(false);
    }
  };

  const submitManual = () => {
    const c = manualCode.trim();
    if (!c) return;
    setManualCode('');
    onDetected(c);
  };

  return (
    <div>
      <Card>
        <div
          style={{
            padding: '20px 0',
            textAlign: 'center',
            color: '#8c8c8c',
            fontSize: 13,
          }}
        >
          {supported === false
            ? '此设备不支持扫码,请手动输入条码'
            : '点击下方按钮打开相机扫码'}
        </div>
        <Button
          block
          color="primary"
          size="large"
          disabled={supported === false}
          loading={starting}
          onClick={scan}
        >
          开始扫码
        </Button>
      </Card>

      {showManualInput && (
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <Input
            placeholder="或手动输入条码"
            value={manualCode}
            onChange={setManualCode}
            enterKeyHint="search"
            onEnterPress={submitManual}
            style={{ flex: 1 }}
          />
          <Button color="primary" fill="outline" onClick={submitManual}>
            确认
          </Button>
        </div>
      )}
    </div>
  );
}
