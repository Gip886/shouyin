import { Button, Card, Form, Input, Typography, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { login } from '../lib/sdk';
import { setSession } from '../lib/api';

export default function LoginPage() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);

  const onSubmit = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const res = await login(values.username, values.password);
      setSession(res.accessToken, {
        id: res.user.id,
        username: res.user.username,
        displayName: res.user.displayName,
        role: res.user.role as 'ADMIN' | 'CASHIER' | 'STOCKER',
      });
      message.success('登录成功');
      nav('/', { replace: true });
    } catch (e: any) {
      // interceptor 已忽略 /pos/ 前缀的错误消息;这里 /auth 的会被吞掉,补一个
      const raw = e?.response?.data?.message;
      const msg = Array.isArray(raw) ? raw.join('；') : raw ?? e?.message ?? '登录失败';
      message.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: 'linear-gradient(135deg,#0f172a,#1e3a8a)',
      }}
    >
      <Card style={{ width: 380, boxShadow: '0 10px 30px rgba(0,0,0,0.35)' }}>
        <Typography.Title level={3} style={{ textAlign: 'center', marginBottom: 6 }}>
          收银台
        </Typography.Title>
        <Typography.Paragraph
          type="secondary"
          style={{ textAlign: 'center', marginBottom: 24 }}
        >
          扫码 · 结账 · 批次级过期防护
        </Typography.Paragraph>
        <Form
          layout="vertical"
          onFinish={onSubmit}
          initialValues={{ username: 'cashier', password: 'cashier123' }}
        >
          <Form.Item
            label="用户名"
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input autoFocus placeholder="cashier / admin" />
          </Form.Item>
          <Form.Item
            label="密码"
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password placeholder="cashier123 / admin123" />
          </Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            block
            size="large"
            loading={loading}
          >
            登录
          </Button>
        </Form>
      </Card>
    </div>
  );
}
