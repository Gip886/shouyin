import {
  Alert,
  Button,
  Card,
  Descriptions,
  Divider,
  Input,
  Space,
  Steps,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
  MobileOutlined,
} from '@ant-design/icons';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState } from 'react';

/**
 * 移动端配置页:给管理员看的。
 * 员工手上装的 APK 首次打开会跳"服务器配置"页扫码;这里就是 QR 出处。
 *
 * 做法:
 * - 让管理员手填(或用当前 window.location 猜一个默认值)服务器根 URL
 * - "测试连接" 打 /api/ping,通了才允许生成 QR
 * - 展示 QR + 复制文本 + 说明步骤
 * - 不做后端网卡嗅探:管理员就在这台电脑前,ipconfig 一分钟能搞定,不值得为此加接口
 */
export default function MobileSetupPage() {
  // 猜个默认值:如果 admin 是从局域网 IP 打开的,自动填这个 host + 3001
  const guessDefault = () => {
    const h = window.location.hostname;
    if (h === 'localhost' || h === '127.0.0.1') {
      return 'http://192.168.1.42:3001';
    }
    return `http://${h}:3001`;
  };

  const [url, setUrl] = useState<string>(guessDefault());
  const [testState, setTestState] = useState<
    | { kind: 'idle' }
    | { kind: 'testing' }
    | { kind: 'ok'; name?: string }
    | { kind: 'fail'; error: string }
  >({ kind: 'idle' });

  // URL 一改就把测试结果清掉,不误导
  useEffect(() => {
    setTestState({ kind: 'idle' });
  }, [url]);

  const test = async () => {
    const clean = url.trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(clean)) {
      setTestState({ kind: 'fail', error: '必须以 http:// 或 https:// 开头' });
      return;
    }
    setTestState({ kind: 'testing' });
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 4000);
    try {
      const res = await fetch(`${clean}/api/ping`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: ctl.signal,
      });
      if (!res.ok) {
        setTestState({ kind: 'fail', error: `HTTP ${res.status}` });
        return;
      }
      const j = await res.json();
      if (!j?.ok) {
        setTestState({ kind: 'fail', error: '响应格式不对' });
        return;
      }
      setTestState({ kind: 'ok', name: j.name });
    } catch (e: any) {
      setTestState({
        kind: 'fail',
        error:
          e?.name === 'AbortError'
            ? '连接超时(4 秒)'
            : e?.message ?? '无法连接',
      });
    } finally {
      clearTimeout(t);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url.trim().replace(/\/+$/, ''));
      message.success('已复制');
    } catch {
      message.warning('复制失败,请手动选中');
    }
  };

  const cleanUrl = url.trim().replace(/\/+$/, '');
  const showQR = testState.kind === 'ok';

  return (
    <div style={{ maxWidth: 900 }}>
      <Typography.Title level={3}>
        <MobileOutlined /> 移动端配置
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        店员在自己的 Android 手机上装完收银库存 APK 后,首次打开会跳到
        <b>"连接服务器"</b>页,让他扫这里的 QR。
      </Typography.Paragraph>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="部署要点"
        description={
          <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 1.8 }}>
            <li>
              后端和员工手机必须在<b>同一 Wi-Fi</b>下(路由器 / AP)。
            </li>
            <li>
              Windows 上跑后端时,先在防火墙里放行 <code>TCP 3001</code>(仅私有网络)。
            </li>
            <li>
              上面的地址一般是这台 PC 的<b>局域网 IPv4</b>。命令行输入
              <code>ipconfig</code>(Windows) 或 <code>ifconfig</code>(mac/Linux) 可查看,
              通常长这样:<code>192.168.x.x</code>。
            </li>
          </ul>
        }
      />

      <Card title="第 1 步 · 填写并测试服务器地址">
        <Space.Compact style={{ width: '100%' }}>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://192.168.1.42:3001"
            size="large"
            onPressEnter={test}
          />
          <Button
            size="large"
            type="primary"
            loading={testState.kind === 'testing'}
            icon={<ReloadOutlined />}
            onClick={test}
          >
            测试连接
          </Button>
        </Space.Compact>

        <div style={{ marginTop: 12 }}>
          {testState.kind === 'idle' && (
            <Tag>未测试</Tag>
          )}
          {testState.kind === 'testing' && (
            <Tag color="processing">测试中...</Tag>
          )}
          {testState.kind === 'ok' && (
            <Tag icon={<CheckCircleOutlined />} color="success">
              连接成功 · {testState.name ?? '服务器'}
            </Tag>
          )}
          {testState.kind === 'fail' && (
            <Tag icon={<CloseCircleOutlined />} color="error">
              连接失败:{testState.error}
            </Tag>
          )}
        </div>
      </Card>

      <Card title="第 2 步 · 员工扫这个 QR" style={{ marginTop: 16 }}>
        {!showQR ? (
          <Alert
            type="warning"
            message="先测试连接,通过后才生成 QR"
            description="没测试就出 QR,员工扫了如果连不通会一头雾水。"
            showIcon
          />
        ) : (
          <div
            style={{
              display: 'flex',
              gap: 24,
              alignItems: 'flex-start',
              flexWrap: 'wrap',
            }}
          >
            <div
              style={{
                padding: 16,
                background: '#fff',
                border: '1px solid #f0f0f0',
                borderRadius: 8,
              }}
            >
              <QRCodeSVG
                value={cleanUrl}
                size={220}
                level="M"
                includeMargin={false}
              />
            </div>
            <div style={{ flex: 1, minWidth: 260 }}>
              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label="URL">
                  <Typography.Text
                    code
                    copyable={{ text: cleanUrl, onCopy: copy }}
                  >
                    {cleanUrl}
                  </Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="服务器名">
                  {testState.kind === 'ok' ? testState.name : '-'}
                </Descriptions.Item>
              </Descriptions>
              <Divider />
              <Steps
                direction="vertical"
                size="small"
                current={-1}
                items={[
                  {
                    title: '员工装 APK',
                    description:
                      '把 app-debug.apk 用微信/AirDrop/USB 传到手机,点击安装。',
                  },
                  {
                    title: '打开 APK',
                    description: '首次会自动跳到"连接服务器"页,点"开始扫码"。',
                  },
                  {
                    title: '扫描这里的 QR',
                    description:
                      '扫到后 APK 会自动 ping 一次,通过就跳到登录页。',
                  },
                  {
                    title: '登录',
                    description: '用店员账号登录,就能扫码入库/盘点/报损了。',
                  },
                ]}
              />
            </div>
          </div>
        )}
      </Card>

      <Card title="第 3 步 · APK 从哪里来" style={{ marginTop: 16 }}>
        <Typography.Paragraph>
          现在还没有直接下载。让技术同学在这台 PC 上按仓库
          <code> apps/mobile/README.APK.md </code>
          的说明打一次包,产出的
          <code> app-debug.apk </code>
          用微信/邮件发给员工,或者放到一个内网可下载的地方。
        </Typography.Paragraph>
        <Alert
          type="info"
          message="以后可以把 APK 挂到后端 /downloads/app.apk,这一页显示一个'下载 APK'按钮。目前先手动分发。"
          showIcon
        />
      </Card>
    </div>
  );
}
