import { useEffect, useState } from 'react';
import { api } from './api';

/**
 * 判断当前是否连通后端 API(不只是 navigator.onLine —— 手机连了 Wi-Fi
 * 但访问不到局域网服务器也算离线)。
 * - 监听 window online/offline 事件
 * - 每 15s ping 一次 /api/health(不存在也没关系,我们只关心网络能不能到);
 *   或用 GET /api/store-settings 探活 —— 已知端点、返回快
 */
export function useOnlineStatus(): {
  online: boolean;
  lastCheckedAt: number | null;
  recheck: () => void;
} {
  const [online, setOnline] = useState<boolean>(navigator.onLine);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const probe = async () => {
      if (!navigator.onLine) {
        if (!cancelled) {
          setOnline(false);
          setLastCheckedAt(Date.now());
        }
        return;
      }
      try {
        // 5s 超时,拿一个已知端点做探活
        await api.get('/store-settings', { timeout: 5000 });
        if (!cancelled) {
          setOnline(true);
          setLastCheckedAt(Date.now());
        }
      } catch {
        if (!cancelled) {
          setOnline(false);
          setLastCheckedAt(Date.now());
        }
      }
    };

    const onOnline = () => probe();
    const onOffline = () => {
      setOnline(false);
      setLastCheckedAt(Date.now());
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    probe();
    const t = setInterval(probe, 15000);

    return () => {
      cancelled = true;
      clearInterval(t);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const recheck = () => {
    // 直接改 state 触发一次 probe 的最简办法:通过 online 值变化 —— 实现里没有内暴露
    // 这里用重置 lastCheckedAt 触发外部知晓,并异步再 probe 一次
    setLastCheckedAt(Date.now());
    (async () => {
      try {
        await api.get('/store-settings', { timeout: 5000 });
        setOnline(true);
      } catch {
        setOnline(false);
      }
      setLastCheckedAt(Date.now());
    })();
  };

  return { online, lastCheckedAt, recheck };
}
