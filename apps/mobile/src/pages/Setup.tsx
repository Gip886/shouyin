import {
  Button,
  Card,
  Dialog,
  Form,
  Input,
  NavBar,
  SafeArea,
  Tag,
  Toast,
} from 'antd-mobile';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Scanner from '../components/Scanner';
import {
  clearServerBaseUrl,
  getServerBaseUrl,
  isNative,
  pingServer,
  setServerBaseUrl,
} from '../lib/serverConfig';
import { applyServerBaseUrl } from '../lib/api';

/**
 * 服务器配置引导页(仅 APK 场景关心;Web 端 baseURL 固定 /api,不会进来)。
 *
 * 用户视角:
 *   1. 装完 APK 打开 → 自动跳这里
 *   2. 让老板/管理员在店里 PC 上打开 admin 后台"移动端配置"页 → QR
 *   3. 员工扫这个 QR → 自动校验 → 通过就跳登录
 *   4. 也可以手动输入(网络故障、QR 坏了时兜底)
 *   5. 装错店/换店后,可以从这里"重新配置"
 */
export default function SetupPage() {
  const nav = useNavigate();
  const [current, setCurrent] = useState<string | null>(null);
  const [manual, setManual] = useState('http://');
  const [scanning, setScanning] = useState(false);
  const [testing, setTesting] = useState(false);
  const [scannerKey, setScannerKey] = useState(0);

  useEffect(() => {
    getServerBaseUrl().then((v) => {
      // Web 端返回 '/api',我们只对 native 上的绝对 URL 感兴趣
      if (v && v !== '/api') setCurrent(v);
    });
  }, []);

  const tryUrl = async (url: string): Promise<boolean> => {
    setTesting(true);
    try {
      const r = await pingServer(url);
      if (!r.ok) {
        Dialog.alert({
          title: '连接失败',
          content: (
            <div>
              <div>无法连上 {url}</div>
              <div
                style={{ marginTop: 6, color: '#8c8c8c', fontSize: 12 }}
              >
                {r.error ?? '未知错误'}
              </div>
              <div
                style={{
                  marginTop: 10,
                  padding: 8,
                  background: '#fff7e6',
                  border: '1px solid #ffd591',
                  borderRadius: 6,
                  fontSize: 12,
                  color: '#874d00',
                }}
              >
                检查:1) 手机和服务器 PC 是否同一 Wi-Fi;2) PC 上后端有没有起来;
                3) Windows 防火墙 3001 端口有没有放行。
              </div>
            </div>
          ),
          confirmText: '知道了',
        });
        return false;
      }
      await setServerBaseUrl(url);
      applyServerBaseUrl(url);
      setCurrent(url);
      Toast.show({
        icon: 'success',
        content: `已连上 ${r.name ?? '服务器'}`,
      });
      // 稍等 Toast 显示一下再跳
      setTimeout(() => nav('/login', { replace: true }), 600);
      return true;
    } finally {
      setTesting(false);
    }
  };

  const onScan = async (text: string) => {
    setScanning(false);
    // QR 里可能是纯 URL,也可能是 JSON {baseUrl: '...'}(未来扩展留口子)
    let url = text.trim();
    try {
      const j = JSON.parse(url);
      if (j && typeof j.baseUrl === 'string') url = j.baseUrl;
    } catch {
      /* 不是 JSON,原样当 URL */
    }
    if (!/^https?:\/\//i.test(url)) {
      Toast.show({
        icon: 'fail',
        content: '扫到的内容不是 http(s) 地址',
      });
      setScannerKey((k) => k + 1);
      return;
    }
    await tryUrl(url);
  };

  const onManual = async () => {
    const url = manual.trim();
    if (!url || url === 'http://') {
      Toast.show({ icon: 'fail', content: '请填服务器地址' });
      return;
    }
    await tryUrl(url);
  };

  const onReset = () => {
    Dialog.confirm({
      title: '重新配置服务器地址?',
      content: '当前登录状态会被清掉,需要重新扫码 + 登录。',
      onConfirm: async () => {
        await clearServerBaseUrl();
        setCurrent(null);
        setManual('http://');
      },
    });
  };

  return (
    <div
      style={{
        minHeight: '100%',
        background: 'linear-gradient(135deg,#0f172a,#1e3a8a)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <SafeArea position="top" />
      <NavBar
        backArrow={false}
        style={{ background: 'transparent', color: '#fff' }}
      >
        <span style={{ color: '#fff' }}>连接服务器</span>
      </NavBar>

      <div style={{ padding: 12, flex: 1 }}>
        {current && (
          <Card>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                  当前已连
                </div>
                <div
                  style={{
                    wordBreak: 'break-all',
                    fontFamily: 'monospace',
                    fontSize: 13,
                    marginTop: 2,
                  }}
                >
                  {current}
                </div>
              </div>
              <Tag color="success">已配置</Tag>
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <Button
                block
                color="primary"
                onClick={() => nav('/login', { replace: true })}
              >
                进入登录
              </Button>
              <Button block fill="outline" onClick={onReset}>
                重新配置
              </Button>
            </div>
          </Card>
        )}

        {!current && (
          <>
            <Card title="扫管理员出示的 QR" style={{ marginTop: 8 }}>
              <div
                style={{
                  fontSize: 12,
                  color: '#8c8c8c',
                  marginBottom: 10,
                }}
              >
                管理员登录后台 → "移动端配置"页 → 让员工扫这里的 QR。
                {!isNative() && (
                  <div
                    style={{
                      marginTop: 6,
                      color: '#874d00',
                    }}
                  >
                    (浏览器打开时不需要配置,dev 服务器代理已经处理。此页面仅 APK 有用。)
                  </div>
                )}
              </div>
              {scanning ? (
                <Scanner
                  key={scannerKey}
                  onDetected={onScan}
                  showManualInput={false}
                  autoStart
                />
              ) : (
                <Button
                  block
                  color="primary"
                  size="large"
                  onClick={() => setScanning(true)}
                >
                  开始扫码
                </Button>
              )}
            </Card>

            <Card title="或手动输入地址" style={{ marginTop: 12 }}>
              <div
                style={{
                  fontSize: 12,
                  color: '#8c8c8c',
                  marginBottom: 10,
                }}
              >
                格式:<code>http://192.168.x.x:3001</code>
                。管理员告诉你就填哪个。
              </div>
              <Form layout="vertical">
                <Form.Item label="服务器地址">
                  <Input
                    placeholder="http://192.168.1.42:3001"
                    value={manual}
                    onChange={setManual}
                    enterKeyHint="go"
                    onEnterPress={onManual}
                    clearable
                  />
                </Form.Item>
              </Form>
              <Button
                block
                color="primary"
                fill="outline"
                loading={testing}
                onClick={onManual}
              >
                测试连接并保存
              </Button>
            </Card>
          </>
        )}
      </div>

      <SafeArea position="bottom" />
    </div>
  );
}
