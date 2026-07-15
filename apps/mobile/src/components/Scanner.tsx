import { useEffect, useRef, useState } from 'react';
import { Button, Input, Space, Toast } from 'antd-mobile';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { DecodeHintType, BarcodeFormat } from '@zxing/library';

interface Props {
  /** 识别到条码后回调,组件内部会停一次,由父组件决定是否重新 start */
  onDetected: (code: string) => void;
  /** 未挂载/未启动时的提示,默认"点击开始扫码" */
  autoStart?: boolean;
  /** 允许手动输入条码作为兜底 */
  showManualInput?: boolean;
}

/**
 * 通用扫码器:
 * - 摄像头持续解码,识别到条码后调 onDetected,再由父决定是否 restart
 * - 关闭页面/组件卸载自动 stop,不占摄像头
 * - 提供手动输入兜底(某些老手机 or 破损条码时用)
 * - iOS Safari 要求用户手势才能 getUserMedia,所以默认不 autoStart
 */
export default function Scanner({
  onDetected,
  autoStart = false,
  showManualInput = true,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [manualCode, setManualCode] = useState('');

  const stop = () => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setRunning(false);
  };

  const start = async () => {
    if (running || starting) return;
    setStarting(true);
    try {
      // 只解一维零售条码,精度更高、误识别更低
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.QR_CODE,
      ]);
      const reader = new BrowserMultiFormatReader(hints);

      // 优先后置摄像头
      const devices = await BrowserMultiFormatReader.listVideoInputDevices();
      const back =
        devices.find((d) => /back|rear|environment|后/i.test(d.label)) ??
        devices[devices.length - 1];

      const controls = await reader.decodeFromVideoDevice(
        back?.deviceId,
        videoRef.current!,
        (result, err, ctrl) => {
          if (result) {
            const text = result.getText();
            // 拿到就先停,避免同一码连续触发
            ctrl.stop();
            controlsRef.current = null;
            setRunning(false);
            onDetected(text);
          }
          // err 频繁出现(每帧未识别),忽略
        },
      );
      controlsRef.current = controls;
      setRunning(true);
    } catch (e: any) {
      const msg =
        e?.name === 'NotAllowedError'
          ? '请授权摄像头权限后重试'
          : e?.message ?? '摄像头启动失败';
      Toast.show({ icon: 'fail', content: msg });
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    if (autoStart) start();
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitManual = () => {
    const c = manualCode.trim();
    if (!c) return;
    setManualCode('');
    stop();
    onDetected(c);
  };

  return (
    <div>
      <div className="scanner-viewport">
        <video ref={videoRef} playsInline muted />
        {running && <div className="scanner-frame" />}
        {running && <div className="scanner-hint">对准条码,识别到后自动停</div>}
        {!running && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#aaa',
              fontSize: 14,
            }}
          >
            {starting ? '摄像头启动中…' : '点击下方开始扫码'}
          </div>
        )}
      </div>

      <Space block style={{ marginTop: 12 }}>
        {running ? (
          <Button block onClick={stop}>
            暂停扫码
          </Button>
        ) : (
          <Button block color="primary" loading={starting} onClick={start}>
            开始扫码
          </Button>
        )}
      </Space>

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
