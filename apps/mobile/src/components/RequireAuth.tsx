import { Navigate, useLocation } from 'react-router-dom';
import { ReactNode, useEffect, useState } from 'react';
import { getToken } from '../lib/api';
import { getServerBaseUrl, isNative } from '../lib/serverConfig';

/**
 * 认证守卫。多做一件事:在 APK 里,如果服务器地址没配,先跳 /setup。
 * 这在 boot gate 已经跳过一次,但组件树可能被别的路径唤醒(比如 401 后跳登录 → 用户又前进回主路径),
 * 再兜一层。
 */
export default function RequireAuth({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const [checked, setChecked] = useState(!isNative()); // Web 端不用检查,直接过
  const [needSetup, setNeedSetup] = useState(false);

  useEffect(() => {
    if (!isNative()) return;
    getServerBaseUrl().then((v) => {
      if (!v) setNeedSetup(true);
      setChecked(true);
    });
  }, []);

  if (!checked) return null; // 首帧极短,不闪不必显示 spinner
  if (needSetup) return <Navigate to="/setup" replace />;
  if (!getToken()) {
    return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  }
  return <>{children}</>;
}
