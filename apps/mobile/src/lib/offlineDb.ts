// 本地离线数据层(IndexedDB via dexie)。
// - products:  商品缓存,联网时全量同步
// - pending_inbounds:  离线入库待提交队列
// - meta:  简单 kv,存"上次同步时间"等
import Dexie, { type EntityTable } from 'dexie';
import type { Product } from './sdk';

export interface PendingInbound {
  clientId: string;          // 本地唯一 id(nanoid/UUID);后端不感知
  productId: string;
  productName: string;       // 冗余,方便 UI 展示不用再查商品表
  productBarcode: string;
  productionDate?: string;   // YYYY-MM-DD;无保质期分类可省
  expiryDate?: string;
  quantity: number;
  costPrice: string;
  createdAt: number;         // Date.now() —— 队列按此排序
  lastError?: string;        // 最近一次 replay 失败原因,便于用户看
  attempts: number;          // replay 尝试次数
}

/**
 * 上传历史:员工事后想核对"我那 8 条到底传上去没有",
 * 不看这里就只能问后台。所以每次 replay 都留一条,成功失败都留。
 * 用自增 id + createdAt 索引;超过 200 条自动裁剪最老的。
 */
export interface UploadHistoryEntry {
  id?: number;               // Dexie 自增
  clientId: string;          // 对应 pendingInbounds.clientId(即便已删,也保留)
  productName: string;
  productBarcode: string;
  quantity: number;
  productionDate?: string;   // 无保质期分类为空
  expiryDate?: string;
  createdAt: number;         // 原 pending 入队时间(方便员工"是我早上扫的那单")
  uploadedAt: number;        // 这次 replay 尝试的时间
  ok: boolean;
  batchId?: string;          // 成功时后端返回的批次 id(用于深度核对)
  batchNo?: string;          // 成功时后端返回的批次号(展示给员工看)
  error?: string;            // 失败时错误
}

export interface MetaRow {
  key: string;
  value: unknown;
}

export const db = new Dexie('shouyin-mobile') as Dexie & {
  products: EntityTable<Product, 'id'>;
  pendingInbounds: EntityTable<PendingInbound, 'clientId'>;
  uploadHistory: EntityTable<UploadHistoryEntry, 'id'>;
  meta: EntityTable<MetaRow, 'key'>;
};

// v2 → v3:仅字段变宽(productionDate/expiryDate 变 optional),不改索引,不需要 upgrade 函数
db.version(3).stores({
  products: 'id, barcode, name, categoryId, updatedAt',
  pendingInbounds: 'clientId, createdAt, productId',
  uploadHistory: '++id, uploadedAt, ok, clientId',
  meta: 'key',
});

// --- 商品缓存 ---
export async function upsertProducts(list: Product[]) {
  await db.products.bulkPut(list);
  await db.meta.put({ key: 'products.lastSyncAt', value: Date.now() });
}

export async function findLocalProductByBarcode(
  barcode: string,
): Promise<Product | null> {
  const p = await db.products.where('barcode').equals(barcode).first();
  return p ?? null;
}

export async function localProductsSyncedAt(): Promise<number | null> {
  const r = await db.meta.get('products.lastSyncAt');
  return (r?.value as number) ?? null;
}

export async function countLocalProducts() {
  return db.products.count();
}

// --- 待提交队列 ---
export async function enqueueInbound(item: Omit<PendingInbound, 'attempts'>) {
  await db.pendingInbounds.add({ ...item, attempts: 0 });
}

export async function listPendingInbounds() {
  return db.pendingInbounds.orderBy('createdAt').toArray();
}

export async function countPendingInbounds() {
  return db.pendingInbounds.count();
}

export async function deletePendingInbound(clientId: string) {
  await db.pendingInbounds.delete(clientId);
}

export async function updatePendingInbound(
  clientId: string,
  patch: Partial<PendingInbound>,
) {
  await db.pendingInbounds.update(clientId, patch);
}

export async function clearPendingInbounds() {
  await db.pendingInbounds.clear();
}

// --- 上传历史 ---
const HISTORY_MAX = 200;

export async function appendHistory(entries: Omit<UploadHistoryEntry, 'id'>[]) {
  if (entries.length === 0) return;
  await db.uploadHistory.bulkAdd(entries as UploadHistoryEntry[]);
  // LRU 裁剪:保留最新 HISTORY_MAX 条
  const total = await db.uploadHistory.count();
  if (total > HISTORY_MAX) {
    const excess = total - HISTORY_MAX;
    const oldest = await db.uploadHistory
      .orderBy('uploadedAt')
      .limit(excess)
      .primaryKeys();
    await db.uploadHistory.bulkDelete(oldest);
  }
}

export async function listUploadHistory(limit = 100) {
  return db.uploadHistory
    .orderBy('uploadedAt')
    .reverse()
    .limit(limit)
    .toArray();
}

export async function countUploadHistory() {
  return db.uploadHistory.count();
}

export async function clearUploadHistory() {
  await db.uploadHistory.clear();
}

export async function deleteHistoryEntry(id: number) {
  await db.uploadHistory.delete(id);
}

// 简易 uuid,不引 nanoid 省一个依赖
export function clientUuid(): string {
  const rnd =
    (crypto as any)?.randomUUID?.() ??
    Math.random().toString(36).slice(2) + Date.now().toString(36);
  return String(rnd);
}
