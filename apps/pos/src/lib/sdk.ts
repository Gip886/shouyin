import { api } from './api';
import type { CheckoutRequest, CheckoutResult, ScanResult, StoreSettings } from '@shouyin/shared';

export async function login(username: string, password: string) {
  const { data } = await api.post<{
    accessToken: string;
    user: { id: string; username: string; displayName: string; role: string };
  }>('/auth/login', { username, password });
  return data;
}

export const scan = (barcode: string) =>
  api.get<ScanResult>(`/pos/scan/${encodeURIComponent(barcode)}`).then((r) => r.data);

export const checkout = (body: CheckoutRequest) =>
  api.post<CheckoutResult>('/pos/checkout', body).then((r) => r.data);

export const getStoreSettings = () =>
  api.get<StoreSettings>('/store-settings').then((r) => r.data);

// 最近订单(用于补打小票选择)
export interface RecentOrder {
  id: string;
  totalAmount: string;
  paidAmount: string;
  paymentMethod: 'CASH' | 'WECHAT' | 'ALIPAY';
  createdAt: string;
  cashier: { username: string; displayName: string };
  items: {
    id: string;
    qty: number;
    unitPrice: string;
    subtotal: string;
    product: { name: string; barcode: string; unit: string };
  }[];
}
export const recentOrders = (limit = 20) =>
  api
    .get<RecentOrder[]>('/reports/recent-orders', { params: { limit } })
    .then((r) => r.data);
