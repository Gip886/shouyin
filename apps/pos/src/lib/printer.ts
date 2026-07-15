// 热敏小票打印抽象层。
// 与 cashDrawer 类似,提供两条对接口径:
//   1. 广播 window 事件 `pos:print-receipt`(壳/扩展可拦截)
//   2. 若配 VITE_PRINTER_URL,POST JSON 到本地驻留桥服务
//      —— 桥服务负责翻译成 ESC/POS 指令走 USB/串口/网口打印
//   3. 若未配桥,fallback 到 iframe + window.print() 渲染 HTML 小票
//        —— 打印机作为系统打印机使用即可(Windows 驱动 / CUPS)
//        —— Chrome 加 --kiosk-printing 可去掉打印对话框

export interface ReceiptItem {
  name: string;
  qty: number;
  unit: string;
  unitPrice: string; // Decimal string
  subtotal: string;
}

export interface Receipt {
  orderId: string;
  storeName: string;
  storeAddress?: string;
  storePhone?: string;
  storeTaxId?: string;
  cashierName: string;
  printedAt: Date;
  items: ReceiptItem[];
  totalAmount: string;
  paidAmount: string;
  change: string;
  paymentMethod: 'CASH' | 'WECHAT' | 'ALIPAY';
  footer?: string; // 底部感谢语,不传则用默认
  widthMm?: 58 | 80; // 小票宽度,默认 80mm
}

const PAYMENT_LABEL: Record<Receipt['paymentMethod'], string> = {
  CASH: '现金',
  WECHAT: '微信',
  ALIPAY: '支付宝',
};

export interface PrintResult {
  ok: boolean;
  method: 'bridge' | 'browser' | 'event-only';
  error?: string;
}

function fmt2(n: number) {
  return n.toString().padStart(2, '0');
}
function stampStr(d: Date) {
  return `${d.getFullYear()}-${fmt2(d.getMonth() + 1)}-${fmt2(
    d.getDate(),
  )} ${fmt2(d.getHours())}:${fmt2(d.getMinutes())}:${fmt2(d.getSeconds())}`;
}

/**
 * 生成小票 HTML(用于浏览器打印 / 预览)。
 * 用等宽字体 + 单列布局,便于 58/80mm 热敏纸对齐。
 */
export function buildReceiptHtml(r: Receipt): string {
  const width = r.widthMm ?? 80;
  const rows = r.items
    .map(
      (it) => `
      <div class="item">
        <div class="name">${escape(it.name)}</div>
        <div class="row">
          <span>${it.qty} ${escape(it.unit)} × ¥${it.unitPrice}</span>
          <span class="right">¥${it.subtotal}</span>
        </div>
      </div>`,
    )
    .join('');
  const totalQty = r.items.reduce((s, it) => s + it.qty, 0);
  const changeRow =
    Number(r.change) > 0
      ? `<div class="row"><span>${
          r.paymentMethod === 'CASH' ? '找零' : '溢收'
        }</span><span class="right">¥${r.change}</span></div>`
      : '';

  const headerLines = [
    r.storeAddress ? `<div class="center small">${escape(r.storeAddress)}</div>` : '',
    r.storePhone ? `<div class="center small">电话:${escape(r.storePhone)}</div>` : '',
    r.storeTaxId ? `<div class="center small">税号:${escape(r.storeTaxId)}</div>` : '',
  ]
    .filter(Boolean)
    .join('');

  const footerText = r.footer && r.footer.trim() !== ''
    ? r.footer
    : '谢谢惠顾 · 欢迎再次光临';
  const footerLines = footerText
    .split(/\r?\n/)
    .map((ln) => `<div class="center">${escape(ln)}</div>`)
    .join('');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Receipt-${r.orderId}</title>
<style>
  @page { size: ${width}mm auto; margin: 0; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Courier New', 'Menlo', 'Consolas', monospace;
    font-size: 12px;
    line-height: 1.5;
    margin: 0;
    padding: 6px 8px;
    width: ${width}mm;
    color: #000;
  }
  .center { text-align: center; }
  .right { text-align: right; }
  .row { display: flex; justify-content: space-between; }
  .line { border-top: 1px dashed #000; margin: 6px 0; }
  .double { border-top: 3px double #000; margin: 6px 0; }
  .store { font-size: 16px; font-weight: 700; }
  .item { margin-bottom: 4px; }
  .name { font-weight: 600; }
  .total { font-size: 16px; font-weight: 700; }
  .small { font-size: 10px; color: #333; }
</style>
</head>
<body>
  <div class="center store">${escape(r.storeName)}</div>
  ${headerLines}
  <div class="center small">销售小票</div>
  <div class="line"></div>
  <div>订单号：${escape(r.orderId)}</div>
  <div>时　间：${stampStr(r.printedAt)}</div>
  <div>收银员：${escape(r.cashierName)}</div>
  <div class="line"></div>
  ${rows}
  <div class="line"></div>
  <div class="row"><span>件数</span><span class="right">${totalQty}</span></div>
  <div class="row total"><span>合计</span><span class="right">¥${r.totalAmount}</span></div>
  <div class="double"></div>
  <div class="row"><span>${PAYMENT_LABEL[r.paymentMethod]}</span><span class="right">¥${r.paidAmount}</span></div>
  ${changeRow}
  <div class="line"></div>
  ${footerLines}
  <div class="center small">${stampStr(r.printedAt)}</div>
  <div style="height: 24px"></div>
</body>
</html>`;
}

function escape(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 打印小票。
 *
 * 顺序:
 *   1. 广播 `pos:print-receipt` 事件(壳/扩展可拦截) — 永远执行
 *   2. 若配 VITE_PRINTER_URL,POST 到桥服务(ESC/POS 主渠道)
 *   3. 若桥失败/未配,且 opts.allowBrowserFallback === true 才 fallback 到 iframe + window.print
 *
 * 默认关闭浏览器 fallback:热敏机场景桥服务是主流,浏览器打印通常会弹对话框或选错打印机,
 * 反而干扰收银员;真机环境下"打不出来"就该报错让人修桥,而不是悄悄弹对话框。
 */
export async function printReceipt(
  r: Receipt,
  opts: { allowBrowserFallback?: boolean } = {},
): Promise<PrintResult> {
  const detail = { ...r, printedAt: r.printedAt.toISOString() };
  try {
    window.dispatchEvent(new CustomEvent('pos:print-receipt', { detail }));
  } catch (e) {
    console.warn('[printer] event dispatch failed', e);
  }

  const bridgeUrl = (import.meta as any).env?.VITE_PRINTER_URL as string | undefined;
  if (bridgeUrl) {
    try {
      await fetch(bridgeUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(detail),
      });
      return { ok: true, method: 'bridge' };
    } catch (e) {
      console.warn('[printer] bridge failed', e);
      if (!opts.allowBrowserFallback) {
        return { ok: false, method: 'bridge', error: String(e) };
      }
      // 桥挂了 + 允许 fallback → 走浏览器
    }
  } else if (!opts.allowBrowserFallback) {
    // 没配桥、也不允许浏览器打印:只发事件,不实际打印
    return { ok: true, method: 'event-only' };
  }

  return await printViaIframe(buildReceiptHtml(r));
}

/**
 * iframe + window.print() 打印。
 * 用隐藏 iframe 而非直接 window.print(),避免污染主页面 & 保留主页面滚动位。
 */
export function printViaIframe(html: string): Promise<PrintResult> {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.setAttribute('aria-hidden', 'true');
    // srcdoc + onload 是最稳的组合,避开 doc.write() 的时序坑
    iframe.srcdoc = html;

    let done = false;
    const finish = (r: PrintResult) => {
      if (done) return;
      done = true;
      // 稍等再移除,给打印对话框留时间抓取内容
      setTimeout(() => iframe.remove(), 2000);
      resolve(r);
    };

    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        finish({ ok: true, method: 'browser' });
      } catch (e) {
        finish({ ok: false, method: 'browser', error: String(e) });
      }
    };
    iframe.onerror = () => finish({ ok: false, method: 'browser', error: 'iframe load error' });
    document.body.appendChild(iframe);

    // 兜底:5s 内没触发 onload 也当失败
    setTimeout(() => finish({ ok: false, method: 'browser', error: 'timeout' }), 5000);
  });
}
