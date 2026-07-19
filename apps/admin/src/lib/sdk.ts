import { api } from './api';
import type {
  NearExpiryBatch,
  CreateBatchRequest,
  AdjustBatchRequest,
  StoreSettings,
  UpdateStoreSettingsRequest,
} from '@shouyin/shared';

// --- 类型（后端返回） ---
export interface Category {
  id: string;
  name: string;
  nearExpiryDays: number;
  hasExpiry: boolean;
  createdAt: string;
}

export interface Product {
  id: string;
  barcode: string;
  name: string;
  categoryId: string;
  category?: Category;
  unit: string;
  salePrice: string;
  costPrice: string;
  nearExpiryDays: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Batch {
  id: string;
  productId: string;
  product?: Product;
  batchNo: string;
  productionDate: string | null;
  expiryDate: string | null;
  quantity: number;
  initialQty: number;
  costPrice: string;
  status: 'ACTIVE' | 'DEPLETED' | 'EXPIRED_REMOVED';
  receivedAt: string;
}

export interface Notification {
  id: string;
  kind: string;
  title: string;
  body: string;
  payload: unknown;
  readAt: string | null;
  createdAt: string;
}

// --- Auth ---
export async function login(username: string, password: string) {
  const { data } = await api.post<{
    accessToken: string;
    user: { id: string; username: string; displayName: string; role: string };
  }>('/auth/login', { username, password });
  return data;
}

// --- Categories ---
export const listCategories = () => api.get<Category[]>('/categories').then((r) => r.data);
export const createCategory = (data: {
  name: string;
  nearExpiryDays?: number;
  hasExpiry?: boolean;
}) => api.post<Category>('/categories', data).then((r) => r.data);
export const updateCategory = (
  id: string,
  data: { name?: string; nearExpiryDays?: number; hasExpiry?: boolean },
) => api.patch<Category>(`/categories/${id}`, data).then((r) => r.data);
export const deleteCategory = (id: string) =>
  api.delete(`/categories/${id}`).then((r) => r.data);

// --- Products ---
export const listProducts = (params: {
  q?: string;
  categoryId?: string;
  isActive?: boolean;
} = {}) => api.get<Product[]>('/products', { params }).then((r) => r.data);
export const createProduct = (data: {
  barcode: string;
  name: string;
  categoryId: string;
  unit?: string;
  salePrice: string;
  costPrice: string;
  nearExpiryDays?: number;
}) => api.post<Product>('/products', data).then((r) => r.data);
export const updateProduct = (id: string, data: Partial<Product>) =>
  api.patch<Product>(`/products/${id}`, data).then((r) => r.data);
export const deleteProduct = (id: string) =>
  api.delete(`/products/${id}`).then((r) => r.data);

// --- Batches ---
export const listBatches = (productId?: string) =>
  api.get<Batch[]>('/batches', { params: { productId } }).then((r) => r.data);
export const nearExpiry = (days = 30) =>
  api.get<NearExpiryBatch[]>('/batches/near-expiry', { params: { days } }).then((r) => r.data);
export const createBatch = (data: CreateBatchRequest) =>
  api.post<Batch>('/batches', data).then((r) => r.data);
export const adjustBatch = (id: string, data: AdjustBatchRequest) =>
  api.post<Batch>(`/batches/${id}/adjust`, data).then((r) => r.data);

// --- Notifications ---
export const listNotifications = (unreadOnly = false) =>
  api
    .get<Notification[]>('/notifications', { params: { unreadOnly } })
    .then((r) => r.data);
export const markNotificationRead = (id: string) =>
  api.patch(`/notifications/${id}/read`).then((r) => r.data);
export const runDailyScan = () =>
  api.post<{ expired: number; nearExpiry: number }>('/notifications/run-daily-scan').then((r) => r.data);

// --- Reports ---
export interface DailySalesRow {
  day: string;
  orders: number;
  total: string;
  qty: number;
}
export interface StockValue {
  totalValue: string;
  totalQty: number;
  totalBatches: number;
  byCategory: { categoryName: string; value: string; qty: number }[];
}
export interface ExpiryLoss {
  batches: number;
  loss: string;
}
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
    product: { name: string; barcode: string };
  }[];
}

export const dailySales = (days = 14) =>
  api.get<DailySalesRow[]>('/reports/daily-sales', { params: { days } }).then((r) => r.data);
export const stockValue = () =>
  api.get<StockValue>('/reports/stock-value').then((r) => r.data);
export const expiryLoss = () =>
  api.get<ExpiryLoss>('/reports/expiry-loss').then((r) => r.data);
export const recentOrders = (limit = 50) =>
  api.get<RecentOrder[]>('/reports/recent-orders', { params: { limit } }).then((r) => r.data);

// --- Store Settings ---
export const getStoreSettings = () =>
  api.get<StoreSettings>('/store-settings').then((r) => r.data);
export const updateStoreSettings = (data: UpdateStoreSettingsRequest) =>
  api.patch<StoreSettings>('/store-settings', data).then((r) => r.data);

// --- Users ---
export type UserRole = 'ADMIN' | 'CASHIER' | 'STOCKER';
export interface User {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}
export const listUsers = () => api.get<User[]>('/users').then((r) => r.data);
export const createUser = (data: {
  username: string;
  displayName: string;
  password: string;
  role?: UserRole;
}) => api.post<User>('/users', data).then((r) => r.data);
export const updateUser = (
  id: string,
  data: { displayName?: string; role?: UserRole; isActive?: boolean },
) => api.patch<User>(`/users/${id}`, data).then((r) => r.data);
export const resetUserPassword = (id: string, password: string) =>
  api.post<User>(`/users/${id}/reset-password`, { password }).then((r) => r.data);
export const changeOwnPassword = (oldPassword: string, newPassword: string) =>
  api
    .post<{ ok: true }>('/users/me/change-password', { oldPassword, newPassword })
    .then((r) => r.data);
