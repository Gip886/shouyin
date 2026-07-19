import {
  DashboardOutlined,
  AppstoreOutlined,
  ShoppingOutlined,
  ContainerOutlined,
  BellOutlined,
  BarChartOutlined,
  SettingOutlined,
  MobileOutlined,
  TeamOutlined,
  KeyOutlined,
  LogoutOutlined,
} from '@ant-design/icons';
import { Avatar, Dropdown, Layout as AntLayout, Menu, Typography, Badge } from 'antd';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { clearSession, getCurrentUser } from '../lib/api';
import { listNotifications } from '../lib/sdk';
import { useState } from 'react';
import ChangePasswordModal from './ChangePasswordModal';

const { Header, Sider, Content } = AntLayout;

// 菜单项 + 谁能看到。role='ADMIN' 表示只有管理员能看,不填则所有登录用户都看得到。
const items: Array<{ key: string; icon: JSX.Element; label: string; role?: string }> = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '仪表盘' },
  { key: '/categories', icon: <AppstoreOutlined />, label: '品类管理' },
  { key: '/products', icon: <ShoppingOutlined />, label: '商品管理' },
  { key: '/batches', icon: <ContainerOutlined />, label: '批次与库存' },
  { key: '/notifications', icon: <BellOutlined />, label: '通知中心' },
  { key: '/reports', icon: <BarChartOutlined />, label: '销售报表' },
  { key: '/settings', icon: <SettingOutlined />, label: '店铺设置' },
  { key: '/mobile-setup', icon: <MobileOutlined />, label: '移动端配置' },
  { key: '/users', icon: <TeamOutlined />, label: '账号管理', role: 'ADMIN' },
];

export default function Layout() {
  const nav = useNavigate();
  const loc = useLocation();
  const user = getCurrentUser();
  const [pwdOpen, setPwdOpen] = useState(false);

  const { data: unread } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => listNotifications(true),
    refetchInterval: 60_000,
  });

  const onLogout = () => {
    clearSession();
    nav('/login', { replace: true });
  };

  // 按角色过滤菜单;后端也标了 @Roles,双保险
  const visibleItems = items.filter((it) => !it.role || it.role === user?.role);
  const badgedItems = visibleItems.map((it) =>
    it.key === '/notifications'
      ? {
          ...it,
          label: (
            <span>
              {it.label}
              {unread && unread.length > 0 ? (
                <Badge count={unread.length} size="small" style={{ marginLeft: 8 }} />
              ) : null}
            </span>
          ),
        }
      : it,
  );

  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      <Sider theme="dark" width={220} breakpoint="lg" collapsedWidth={64}>
        <div
          style={{
            height: 56,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 600,
            fontSize: 16,
            letterSpacing: 2,
          }}
        >
          收银后台
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[loc.pathname]}
          items={badgedItems}
          onClick={({ key }) => nav(key)}
        />
      </Sider>
      <AntLayout>
        <Header
          style={{
            background: '#fff',
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            borderBottom: '1px solid #f0f0f0',
          }}
        >
          <Dropdown
            menu={{
              items: [
                {
                  key: 'change-password',
                  icon: <KeyOutlined />,
                  label: '修改密码',
                  onClick: () => setPwdOpen(true),
                },
                { type: 'divider' as const },
                { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: onLogout },
              ],
            }}
          >
            <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar style={{ background: '#1677ff' }}>
                {user?.displayName?.[0] ?? 'U'}
              </Avatar>
              <Typography.Text>{user?.displayName ?? user?.username}</Typography.Text>
            </div>
          </Dropdown>
        </Header>
        <Content style={{ padding: 24, background: '#f5f7fa' }}>
          <Outlet />
        </Content>
      </AntLayout>
      <ChangePasswordModal open={pwdOpen} onClose={() => setPwdOpen(false)} />
    </AntLayout>
  );
}
