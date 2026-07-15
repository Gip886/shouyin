// 钱箱开抽屉抽象层。
// Web POS 无法直接触发硬件,提供两条对接口径,后期换真机改此文件即可:
//   1. 广播 window 事件 `pos:open-cash-drawer` — Electron/Tauri 壳、扩展、内嵌桥都能监听。
//   2. 若配置了 VITE_CASH_DRAWER_URL,POST 到本地驻留服务(如热敏打印机 ESC/POS 网关、
//      或 CashDrawer USB HID 桥),以 no-cors 单向触发。
export interface CashDrawerContext {
  orderId: string;
  totalAmount: string;
  paidAmount: string;
  change: string;
  paymentMethod: string;
}

export interface CashDrawerResult {
  ok: boolean;
  method: 'event' | 'bridge' | 'noop';
  error?: string;
}

export async function openCashDrawer(ctx: CashDrawerContext): Promise<CashDrawerResult> {
  const detail = { ...ctx, ts: Date.now() };
  try {
    window.dispatchEvent(new CustomEvent('pos:open-cash-drawer', { detail }));
  } catch (e) {
    // 不阻断
    console.warn('[cash-drawer] event dispatch failed', e);
  }

  const bridgeUrl = (import.meta as any).env?.VITE_CASH_DRAWER_URL as string | undefined;
  if (bridgeUrl) {
    try {
      await fetch(bridgeUrl, {
        method: 'POST',
        mode: 'no-cors', // 桥服务通常在 localhost,跨 origin 单向触发即可
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(detail),
      });
      return { ok: true, method: 'bridge' };
    } catch (e) {
      return { ok: false, method: 'bridge', error: String(e) };
    }
  }
  return { ok: true, method: 'event' };
}
