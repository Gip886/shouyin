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
      nav('/dashboard', { replace: true });
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
        background: 'linear-gradient(135deg,#f0f4ff,#eaf7ee)',
      }}
    >
      <Card style={{ width: 380, boxShadow: '0 6px 20px rgba(0,0,0,0.08)' }}>
        <Typography.Title level={3} style={{ textAlign: 'center', marginBottom: 6 }}>
          收银后台
        </Typography.Title>
        <Typography.Paragraph
          type="secondary"
          style={{ textAlign: 'center', marginBottom: 24 }}
        >
          批次级过期管理 · 单店版
        </Typography.Paragraph>
        <Form
          layout="vertical"
          onFinish={onSubmit}
          initialValues={{ username: 'admin', password: 'admin123' }}
        >
          <Form.Item
            label="用户名"
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input autoFocus placeholder="admin / cashier" />
          </Form.Item>
          <Form.Item
            label="密码"
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password placeholder="admin123 / cashier123" />
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
