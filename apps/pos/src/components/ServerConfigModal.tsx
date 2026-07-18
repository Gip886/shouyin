import {
  Alert,
  Button,
  Descriptions,
  Input,
  Modal,
  Space,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useEffect, useState } from 'react';
import {
  clearServerBaseUrl,
  getServerBaseUrl,
  pingServer,
  setServerBaseUrl,
} from '../lib/serverConfig';
import { applyServerBaseUrl } from '../lib/api';

/**
 * 服务器地址设置弹窗。POS 端不常改,做个 modal 就够,不占顶层路由。
 * 单机部署时空着 = 走同源 /api,员工完全不用管;多机部署时填绝对 URL。
 */
export default function ServerConfigModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [url, setUrl] = useState('');
  const [testState, setTestState] = useState<
    | { kind: 'idle' }
    | { kind: 'testing' }
    | { kind: 'ok'; name?: string }
    | { kind: 'fail'; error: string }
  >({ kind: 'idle' });

  useEffect(() => {
    if (open) {
      setUrl(getServerBaseUrl() || '');
      setTestState({ kind: 'idle' });
    }
  }, [open]);

  const test = async () => {
    setTestState({ kind: 'testing' });
    const r = await pingServer(url);
    if (r.ok) setTestState({ kind: 'ok', name: r.name });
    else setTestState({ kind: 'fail', error: r.error ?? '未知错误' });
  };

  const save = () => {
    if (url.trim() && testState.kind !== 'ok') {
      message.warning('请先"测试连接"通过再保存,避免填错 URL 后连不上');
      return;
    }
    setServerBaseUrl(url);
    applyServerBaseUrl();
    message.success(url.trim() ? '已保存,后续请求走新地址' : '已清除,恢复同源');
    onClose();
  };

  const useDefault = () => {
    clearServerBaseUrl();
    applyServerBaseUrl();
    setUrl('');
    setTestState({ kind: 'idle' });
    message.success('已切换到"跟随当前页面"');
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="服务器地址"
      footer={[
        <Button key="clear" onClick={useDefault}>
          恢复默认(同源)
        </Button>,
        <Button key="cancel" onClick={onClose}>
          取消
        </Button>,
        <Button key="save" type="primary" onClick={save}>
          保存
        </Button>,
      ]}
      width={560}
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="什么时候要改?"
        description={
          <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 1.8 }}>
            <li>
              <b>同一台 PC</b>装了后端和收银台 → 留空,用同源(默认)
            </li>
            <li>
              <b>后端在别的 PC</b> → 填绝对地址,如
              <code> http://192.168.31.112:3001</code>
            </li>
          </ul>
        }
      />

      <Descriptions column={1} size="small" bordered style={{ marginBottom: 16 }}>
        <Descriptions.Item label="当前生效">
          {getServerBaseUrl() ? (
            <Typography.Text code>
              {getServerBaseUrl()}
              <span style={{ marginLeft: 6, color: '#8c8c8c', fontSize: 12 }}>
                (手动配置)
              </span>
            </Typography.Text>
          ) : (
            <span>
              <Typography.Text code>{window.location.origin}</Typography.Text>
              <span style={{ marginLeft: 6, color: '#8c8c8c', fontSize: 12 }}>
                (同源,跟随当前页面)
              </span>
            </span>
          )}
        </Descriptions.Item>
      </Descriptions>

      <Space.Compact style={{ width: '100%' }}>
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="http://192.168.31.112:3001,留空 = 同源"
          onPressEnter={test}
        />
        <Button
          type="primary"
          icon={<ReloadOutlined />}
          loading={testState.kind === 'testing'}
          onClick={test}
          disabled={!url.trim()}
        >
          测试连接
        </Button>
      </Space.Compact>

      <div style={{ marginTop: 12 }}>
        {testState.kind === 'idle' && <Tag>未测试</Tag>}
        {testState.kind === 'testing' && <Tag color="processing">测试中...</Tag>}
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
    </Modal>
  );
}
