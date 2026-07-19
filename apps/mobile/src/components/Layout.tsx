import { ActionSheet, Badge, NavBar, SafeArea, TabBar, Toast } from 'antd-mobile';
import type { Action } from 'antd-mobile/es/components/action-sheet';
import {
  AddSquareOutline,
  UnorderedListOutline,
  DeleteOutline,
  ClockCircleOutline,
  UploadOutline,
} from 'antd-mobile-icons';
import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { clearSession, getCurrentUser } from '../lib/api';
import { useStoreSettings } from '../lib/useStoreSettings';
import { useOffline } from '../lib/OfflineContext';
import { isNative } from '../lib/serverConfig';
import ChangePasswordSheet from './ChangePasswordSheet';

const ONLINE_ONLY_TABS = new Set(['/stocktake', '/scrap', '/near-expiry']);

const TABS = [
  { key: '/inbound', title: '入库', icon: <AddSquareOutline /> },
  { key: '/stocktake', title: '盘点', icon: <UnorderedListOutline /> },
  { key: '/scrap', title: '报损', icon: <DeleteOutline /> },
  { key: '/near-expiry', title: '临期', icon: <ClockCircleOutline /> },
  { key: '/pending', title: '待同步', icon: <UploadOutline /> },
];

export default function Layout() {
  const nav = useNavigate();
  const loc = useLocation();
  const store = useStoreSettings();
  const user = getCurrentUser();
  const { online, pending } = useOffline();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);

  const active =
    TABS.find((t) => loc.pathname.startsWith(t.key))?.key ?? '/inbound';
  const activeTitle = TABS.find((t) => t.key === active)?.title ?? '';

  const onTabChange = (key: string) => {
    if (!online && ONLINE_ONLY_TABS.has(key)) {
      Toast.show({ content: '此功能需联网,请先连接局域网' });
      return;
    }
    nav(key);
  };

  const menuActions: Action[] = [
    {
      text: '修改密码',
      key: 'change-password',
      description: '给自己换一个新的登录密码',
      onClick: () => {
        setMenuOpen(false);
        setPwdOpen(true);
      },
    },
    ...(isNative()
      ? [
          {
            text: '重新绑定服务器',
            key: 'setup',
            description: '换店铺 / 后端 IP 变了 / 扫错 QR 了都点这里',
            onClick: () => {
              setMenuOpen(false);
              clearSession(); // 顺手清登录态 —— 换后端后原 token 无效
              nav('/setup?rebind=1', { replace: true });
            },
          },
        ]
      : []),
    {
      text: '退出登录',
      key: 'logout',
      danger: true,
      onClick: () => {
        setMenuOpen(false);
        clearSession();
        nav('/login', { replace: true });
      },
    },
  ];

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#f5f5f5',
      }}
    >
      <SafeArea position="top" />
      <NavBar
        backArrow={false}
        left={
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: online ? '#52c41a' : '#bfbfbf',
                boxShadow: online ? '0 0 6px #52c41a' : 'none',
              }}
            />
            {online ? '在线' : '离线'}
          </span>
        }
        right={
          <span
            style={{ fontSize: 12, color: '#888' }}
            onClick={() => setMenuOpen(true)}
          >
            {user?.displayName || user?.username} ▾
          </span>
        }
      >
        {store.storeName} · {activeTitle}
      </NavBar>

      <ActionSheet
        visible={menuOpen}
        actions={menuActions}
        onClose={() => setMenuOpen(false)}
        cancelText="取消"
      />
      <ChangePasswordSheet visible={pwdOpen} onClose={() => setPwdOpen(false)} />

      <div style={{ flex: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <Outlet />
      </div>

      <TabBar
        activeKey={active}
        onChange={onTabChange}
        style={{ background: '#fff', borderTop: '1px solid #eee' }}
      >
        {TABS.map((t) => {
          const disabled = !online && ONLINE_ONLY_TABS.has(t.key);
          const badge =
            t.key === '/pending' && pending.count > 0 ? String(pending.count) : undefined;
          return (
            <TabBar.Item
              key={t.key}
              icon={
                <span style={{ opacity: disabled ? 0.35 : 1 }}>{t.icon}</span>
              }
              title={
                <span style={{ opacity: disabled ? 0.35 : 1 }}>{t.title}</span>
              }
              badge={badge as any}
            />
          );
        })}
      </TabBar>
      <SafeArea position="bottom" />
    </div>
  );
}
