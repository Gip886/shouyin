import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { api } from './api';

/**
 * 是否连通后端 API(不是 navigator.onLine —— 手机连了 Wi-Fi 但访问不到局域网服务器也算离线)。
 *
 * 判定策略:
 * - Web:navigator.onLine 事件 + 每 15s 打一次 /api/ping
 * - APK:@capacitor/network 事件(准确知道 Wi-Fi/蜂窝/无网)+ 同样的 15s ping
 *   两条通道叠加:硬件网络变化立刻反应,服务器/端口变化靠 ping 兜底
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
        // 打公开端点 /ping,不需要登录态。5s 超时,慢就当离线。
        await api.get('/ping', { timeout: 5000 });
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

    const onWebOnline = () => probe();
    const onWebOffline = () => {
      setOnline(false);
      setLastCheckedAt(Date.now());
    };
    window.addEventListener('online', onWebOnline);
    window.addEventListener('offline', onWebOffline);

    // Native:Wi-Fi/流量切换立刻响应。@capacitor/network 在 web 上会 fall back 到 navigator.onLine
    // 事件,重复监听没害,但只在 native 上叫一次更干净
    let netHandle: { remove: () => void } | null = null;
    if (Capacitor.isNativePlatform()) {
      Network.addListener('networkStatusChange', (s) => {
        if (!s.connected) {
          setOnline(false);
          setLastCheckedAt(Date.now());
        } else {
          probe();
        }
      }).then((h) => {
        if (cancelled) h.remove();
        else netHandle = h;
      });
    }

    probe();
    const t = setInterval(probe, 15000);

    return () => {
      cancelled = true;
      clearInterval(t);
      window.removeEventListener('online', onWebOnline);
      window.removeEventListener('offline', onWebOffline);
      netHandle?.remove();
    };
  }, []);

  const recheck = () => {
    setLastCheckedAt(Date.now());
    (async () => {
      try {
        await api.get('/ping', { timeout: 5000 });
        setOnline(true);
      } catch {
        setOnline(false);
      }
      setLastCheckedAt(Date.now());
    })();
  };

  return { online, lastCheckedAt, recheck };
}
