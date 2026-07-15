import { useQuery } from '@tanstack/react-query';
import type { StoreSettings } from '@shouyin/shared';
import { getStoreSettings } from './sdk';

const CACHE_KEY = 'shouyin.pos.store-settings';

const FALLBACK: StoreSettings = {
  id: 'default',
  storeName: '我的小店',
  address: '',
  phone: '',
  taxId: '',
  receiptFooter: '谢谢惠顾 · 欢迎再次光临',
  receiptWidthMm: 80,
  autoPrintReceipt: true,
  allowBrowserPrint: false,
  updatedAt: '',
};

function loadCache(): StoreSettings | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as StoreSettings) : null;
  } catch {
    return null;
  }
}

function saveCache(s: StoreSettings) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(s));
  } catch {
    /* localStorage 满/禁用就算了 */
  }
}

/**
 * 收银端读店铺配置。
 * - 每 60s 自动刷新一次(admin 改完最多 60s 后生效)
 * - 失败时用 localStorage 上一份;都没有则给硬编码兜底,避免小票抬头为空
 */
export function useStoreSettings(): StoreSettings {
  const q = useQuery({
    queryKey: ['store-settings'],
    queryFn: async () => {
      const s = await getStoreSettings();
      saveCache(s);
      return s;
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
    // 网络断了/API 挂了都吞掉;打印小票场景不能因这个卡住
    retry: 1,
  });

  return q.data ?? loadCache() ?? FALLBACK;
}
