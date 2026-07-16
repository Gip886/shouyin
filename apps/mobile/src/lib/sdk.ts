import { api } from './api';
import type {
  AdjustBatchRequest,
  CreateBatchRequest,
  NearExpiryBatch,
  StoreSettings,
} from '@shouyin/shared';

// --- 后端返回 ---
export interface Category {
  id: string;
  name: string;
  nearExpiryDays: number;
  hasExpiry: boolean;
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

// --- Auth ---
export async function login(username: string, password: string) {
  const { data } = await api.post<{
    accessToken: string;
    user: { id: string; username: string; displayName: string; role: string };
  }>('/auth/login', { username, password });
  return data;
}

// --- Products (按条码查) ---
export const findProductByBarcode = (barcode: string) =>
  api
    .get<Product[]>('/products', { params: { q: barcode } })
    .then((r) => r.data.find((p) => p.barcode === barcode) ?? null);

export const listProducts = (q?: string) =>
  api.get<Product[]>('/products', { params: { q } }).then((r) => r.data);

// --- Batches ---
export const listBatchesByProduct = (productId: string) =>
  api.get<Batch[]>('/batches', { params: { productId } }).then((r) => r.data);

/** 深度确认某个批次(用于历史项点击查看) */
export const getBatch = (id: string) =>
  api.get<Batch>(`/batches/${id}`).then((r) => r.data);

export const nearExpiry = (days = 30) =>
  api
    .get<NearExpiryBatch[]>('/batches/near-expiry', { params: { days } })
    .then((r) => r.data);

export const createBatch = (data: CreateBatchRequest) =>
  api.post<Batch>('/batches', data).then((r) => r.data);

// 批量入库(供离线队列 replay 使用)。逐条尝试,单条失败不影响其它
export interface BulkCreateResultItem {
  index: number;
  ok: boolean;
  batchId?: string;
  batchNo?: string;
  error?: string;
}
export interface BulkCreateResult {
  total: number;
  succeeded: number;
  failed: number;
  results: BulkCreateResultItem[];
}
export const bulkCreateBatches = (items: CreateBatchRequest[]) =>
  api
    .post<BulkCreateResult>('/batches/bulk', { items })
    .then((r) => r.data);

export const adjustBatch = (id: string, data: AdjustBatchRequest) =>
  api.post<Batch>(`/batches/${id}/adjust`, data).then((r) => r.data);

// --- Store Settings ---
export const getStoreSettings = () =>
  api.get<StoreSettings>('/store-settings').then((r) => r.data);
