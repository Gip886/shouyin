import { Button, Form, Input, NavBar, SafeArea, Toast } from 'antd-mobile';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { login } from '../lib/sdk';
import { setSession } from '../lib/api';
import { isNative } from '../lib/serverConfig';

export default function LoginPage() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const res = await login(values.username, values.password);
      setSession(res.accessToken, {
        id: res.user.id,
        username: res.user.username,
        displayName: res.user.displayName,
        role: res.user.role as 'ADMIN' | 'CASHIER' | 'STOCKER',
      });
      Toast.show({ icon: 'success', content: '登录成功' });
      nav('/', { replace: true });
    } catch (e: any) {
      const raw = e?.response?.data?.message;
      const msg = Array.isArray(raw) ? raw.join('；') : raw ?? e?.message ?? '登录失败';
      Toast.show({ icon: 'fail', content: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        height: '100%',
        background: 'linear-gradient(135deg,#0f172a,#1e3a8a)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <SafeArea position="top" />
      <NavBar
        backArrow={false}
        style={{ background: 'transparent', color: '#fff' }}
        right={
          // 只在 APK 里显示这个入口 —— Web 端 baseURL 固定 /api,没这个概念
          isNative() ? (
            <span
              style={{ color: '#fff', fontSize: 12 }}
              onClick={() => nav('/setup?rebind=1', { replace: true })}
            >
              重新绑定服务器
            </span>
          ) : null
        }
      >
        <span style={{ color: '#fff' }}>移动库存</span>
      </NavBar>
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 24px',
        }}
      >
        <div
          style={{
            width: '100%',
            background: '#fff',
            borderRadius: 16,
            padding: 24,
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          }}
        >
          <h2 style={{ textAlign: 'center', margin: '0 0 8px' }}>登录</h2>
          <p
            style={{
              textAlign: 'center',
              color: '#8c8c8c',
              margin: 0,
              marginBottom: 16,
              fontSize: 12,
            }}
          >
            扫码入库 · 盘点 · 报损
          </p>
          <Form
            layout="vertical"
            onFinish={onFinish}
            initialValues={{ username: 'admin', password: 'admin123' }}
            footer={
              <Button block color="primary" size="large" type="submit" loading={loading}>
                登录
              </Button>
            }
          >
            <Form.Item
              label="用户名"
              name="username"
              rules={[{ required: true, message: '请输入用户名' }]}
            >
              <Input clearable placeholder="admin / cashier" />
            </Form.Item>
            <Form.Item
              label="密码"
              name="password"
              rules={[{ required: true, message: '请输入密码' }]}
            >
              <Input type="password" clearable placeholder="admin123" />
            </Form.Item>
          </Form>
        </div>
      </div>
      <SafeArea position="bottom" />
    </div>
  );
}
