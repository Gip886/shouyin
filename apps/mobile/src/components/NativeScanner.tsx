import { useEffect, useRef, useState } from 'react';
import { Button, Card, Dialog, Input, Toast } from 'antd-mobile';
import {
  BarcodeScanner,
  BarcodeFormat,
} from '@capacitor-mlkit/barcode-scanning';
import type { ScannerProps } from './Scanner';

/**
 * Capacitor(APK)版 Scanner —— 走本地打包的 ML Kit,不依赖 Google Play Services。
 *
 * 之前尝试过用 `BarcodeScanner.scan()`(Google Code Scanner),但对国内环境不靠谱:
 * - 华为/小米/OPPO 没 Play Services 的机型直接报"扫码模块不可用"
 * - 有 Play Services 也要联 Google 下模块,国内基本连不上
 *
 * 现在:
 *   startScan() → 原生打开相机预览,WebView 变透明,前端画取景框浮在上面
 *   识别到条码后自动 stopScan(),回调 onDetected
 *   卸载时也 stopScan(),避免相机泄漏
 */

const FORMATS = [
  BarcodeFormat.Ean13,
  BarcodeFormat.Ean8,
  BarcodeFormat.UpcA,
  BarcodeFormat.UpcE,
  BarcodeFormat.Code128,
  BarcodeFormat.Code39,
  BarcodeFormat.QrCode,
];

export default function NativeScanner({
  onDetected,
  showManualInput = true,
}: ScannerProps) {
  const [starting, setStarting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [supported, setSupported] = useState<boolean | null>(null);
  const listenerRef = useRef<{ remove: () => void } | null>(null);
  // 用 ref 记 onDetected,避免闭包捕获旧值
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  useEffect(() => {
    BarcodeScanner.isSupported()
      .then((r) => setSupported(!!r.supported))
      .catch(() => setSupported(false));

    // 组件卸载:确保相机、body 透明、监听全部还原
    return () => {
      stopScanNow();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopScanNow = async () => {
    try {
      await BarcodeScanner.stopScan();
    } catch {
      /* 没在扫也 OK */
    }
    listenerRef.current?.remove();
    listenerRef.current = null;
    document.body.classList.remove('scanner-active');
    setScanning(false);
  };

  const startScanNow = async () => {
    if (starting || scanning) return;
    setStarting(true);
    try {
      // 权限
      const perm = await BarcodeScanner.requestPermissions();
      if (perm.camera !== 'granted' && perm.camera !== 'limited') {
        // denied 有两种情况:
        //  - 用户点了拒绝(以后按钮再点会再弹一次,可以引导他到设置)
        //  - manifest 漏了 CAMERA 权限(拒绝弹窗压根不会出现)—— 这时"应用权限"里也看不到"相机"
        // 分别给对应提示
        if (perm.camera === 'denied') {
          Dialog.alert({
            title: '相机权限被拒绝',
            content: (
              <div>
                <div>请前往手机 <b>设置 → 应用 → 收银库存 → 权限</b> 手动开启相机。</div>
                <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 8 }}>
                  如果权限列表里根本看不到"相机",说明这个 APK 编译时漏了 CAMERA
                  声明,需要重新打包 —— 请通知管理员。
                </div>
              </div>
            ),
            confirmText: '知道了',
          });
        } else {
          Toast.show({
            icon: 'fail',
            content: `相机权限:${perm.camera}`,
          });
        }
        return;
      }

      // 挂事件监听(必须在 startScan 之前挂,不然可能漏第一帧结果)
      const handle = await BarcodeScanner.addListener(
        'barcodesScanned',
        async (event) => {
          const raw = event?.barcodes?.[0]?.rawValue;
          if (!raw) return;
          // 拿到就停,避免同一码连续触发
          await stopScanNow();
          onDetectedRef.current(raw);
        },
      );
      listenerRef.current = handle;

      // 把 body 变透明,让原生相机预览可见
      document.body.classList.add('scanner-active');
      setScanning(true);

      await BarcodeScanner.startScan({ formats: FORMATS });
    } catch (e: any) {
      const msg = e?.message ?? e?.errorMessage ?? '相机启动失败';
      Toast.show({ icon: 'fail', content: msg });
      await stopScanNow();
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

  // 扫描进行中:全屏透明 overlay + 取景框 + 停止按钮
  if (scanning) {
    return (
      <div className="native-scanner-overlay">
        <div className="native-scanner-frame" />
        <div className="native-scanner-hint">对准条码,识别到自动停</div>
        <div className="native-scanner-controls">
          <Button
            color="danger"
            fill="solid"
            onClick={stopScanNow}
          >
            取消扫码
          </Button>
        </div>
      </div>
    );
  }

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
          onClick={startScanNow}
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
