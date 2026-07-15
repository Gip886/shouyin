// 前后端共享的枚举与 DTO 类型

export const BatchStatus = {
  ACTIVE: 'ACTIVE',
  DEPLETED: 'DEPLETED',
  EXPIRED_REMOVED: 'EXPIRED_REMOVED',
} as const;
export type BatchStatus = (typeof BatchStatus)[keyof typeof BatchStatus];

export const TxnType = {
  IN: 'IN', // 入库
  SALE: 'SALE', // 销售
  ADJUST: 'ADJUST', // 盘点调整
  SCRAP: 'SCRAP', // 报损/过期下架
} as const;
export type TxnType = (typeof TxnType)[keyof typeof TxnType];

export const Role = {
  ADMIN: 'ADMIN',
  CASHIER: 'CASHIER',
  STOCKER: 'STOCKER',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const PaymentMethod = {
  CASH: 'CASH',
  WECHAT: 'WECHAT',
  ALIPAY: 'ALIPAY',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

// 扫码结果码
export const ScanCode = {
  OK: 'OK',
  NEAR_EXPIRY: 'NEAR_EXPIRY',
  EXPIRED: 'EXPIRED',
  OUT_OF_STOCK: 'OUT_OF_STOCK',
  NOT_FOUND: 'NOT_FOUND',
} as const;
export type ScanCode = (typeof ScanCode)[keyof typeof ScanCode];

// ---------- POS ----------

export interface ScanRequest {
  barcode: string;
}

export interface ScanResult {
  code: ScanCode;
  message: string;
  product?: {
    id: string;
    barcode: string;
    name: string;
    unit: string;
    salePrice: string; // Decimal 序列化为字符串，避免精度丢失
  };
  batch?: {
    id: string;
    batchNo: string;
    productionDate: string; // ISO date
    expiryDate: string;
    quantity: number;
    daysLeft: number; // 距离过期天数，负数表示已过期
  };
}

export interface CheckoutItemInput {
  batchId: string;
  qty: number;
  unitPrice: string; // 允许收银员改价，服务端会校验
}

export interface CheckoutRequest {
  items: CheckoutItemInput[];
  paidAmount: string;
  paymentMethod: PaymentMethod;
}

export interface CheckoutResult {
  orderId: string;
  totalAmount: string;
  change: string;
}

// ---------- 批次 / 库存 ----------

export interface CreateBatchRequest {
  productId: string;
  batchNo?: string; // 空则后端自动生成
  productionDate: string; // YYYY-MM-DD
  expiryDate: string; // YYYY-MM-DD（前端算好或直接选）
  quantity: number;
  costPrice: string;
}

export interface NearExpiryBatch {
  id: string;
  batchNo: string;
  productId: string;
  productName: string;
  barcode: string;
  productionDate: string;
  expiryDate: string;
  daysLeft: number;
  quantity: number;
  costPrice: string;
  urgency: 'RED' | 'YELLOW' | 'GREEN'; // 红<7天，黄7-30天，绿>30
}

export interface AdjustBatchRequest {
  delta: number; // 正数增加、负数减少
  reason: string;
}

// ---------- 店铺配置 ----------

export interface StoreSettings {
  id: string;
  storeName: string;
  address: string;
  phone: string;
  taxId: string;
  receiptFooter: string;
  receiptWidthMm: number; // 58 或 80
  autoPrintReceipt: boolean; // 结账后是否自动打印
  allowBrowserPrint: boolean; // 桥不可用时是否允许 window.print 兜底
  updatedAt: string;
}

export type UpdateStoreSettingsRequest = Partial<
  Omit<StoreSettings, 'id' | 'updatedAt'>
>;
