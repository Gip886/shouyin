import { NavBar, SafeArea, TabBar } from 'antd-mobile';
import {
  AddSquareOutline,
  UnorderedListOutline,
  DeleteOutline,
  ClockCircleOutline,
} from 'antd-mobile-icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { clearSession, getCurrentUser } from '../lib/api';
import { useStoreSettings } from '../lib/useStoreSettings';

const TABS = [
  { key: '/inbound', title: '入库', icon: <AddSquareOutline /> },
  { key: '/stocktake', title: '盘点', icon: <UnorderedListOutline /> },
  { key: '/scrap', title: '报损', icon: <DeleteOutline /> },
  { key: '/near-expiry', title: '临期', icon: <ClockCircleOutline /> },
];

export default function Layout() {
  const nav = useNavigate();
  const loc = useLocation();
  const store = useStoreSettings();
  const user = getCurrentUser();

  const active = TABS.find((t) => loc.pathname.startsWith(t.key))?.key ?? '/inbound';
  const activeTitle = TABS.find((t) => t.key === active)?.title ?? '';

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
        right={
          <span
            style={{ fontSize: 12, color: '#888' }}
            onClick={() => {
              clearSession();
              nav('/login', { replace: true });
            }}
          >
            {user?.displayName || user?.username} · 退出
          </span>
        }
      >
        {store.storeName} · {activeTitle}
      </NavBar>

      <div style={{ flex: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <Outlet />
      </div>

      <TabBar
        activeKey={active}
        onChange={(k) => nav(k)}
        style={{ background: '#fff', borderTop: '1px solid #eee' }}
      >
        {TABS.map((t) => (
          <TabBar.Item key={t.key} icon={t.icon} title={t.title} />
        ))}
      </TabBar>
      <SafeArea position="bottom" />
    </div>
  );
}
