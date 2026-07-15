import { useQuery } from '@tanstack/react-query';
import type { StoreSettings } from '@shouyin/shared';
import { getStoreSettings } from './sdk';

const CACHE_KEY = 'shouyin.mobile.store-settings';
const FALLBACK: StoreSettings = {
  id: 'default',
  storeName: '我的小店',
  address: '',
  phone: '',
  taxId: '',
  receiptFooter: '',
  receiptWidthMm: 80,
  autoPrintReceipt: true,
  allowBrowserPrint: false,
  updatedAt: '',
};

const load = (): StoreSettings | null => {
  try {
    const r = localStorage.getItem(CACHE_KEY);
    return r ? (JSON.parse(r) as StoreSettings) : null;
  } catch {
    return null;
  }
};
const save = (s: StoreSettings) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
};

export function useStoreSettings(): StoreSettings {
  const q = useQuery({
    queryKey: ['store-settings'],
    queryFn: async () => {
      const s = await getStoreSettings();
      save(s);
      return s;
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 1,
  });
  return q.data ?? load() ?? FALLBACK;
}
