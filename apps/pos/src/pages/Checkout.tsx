import {
  Button,
  Card,
  Divider,
  Empty,
  Input,
  InputNumber,
  InputRef,
  Layout,
  Modal,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  LogoutOutlined,
  ScanOutlined,
  DeleteOutlined,
  ClearOutlined,
  PrinterOutlined,
  ThunderboltOutlined,
  DollarOutlined,
  WechatOutlined,
  AlipayCircleOutlined,
  SettingOutlined,
  KeyOutlined,
} from '@ant-design/icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Decimal from 'decimal.js';
import dayjs from 'dayjs';
import type { PaymentMethod, ScanResult } from '@shouyin/shared';
import { checkout, recentOrders, scan, type RecentOrder } from '../lib/sdk';
import { clearSession, getCurrentUser } from '../lib/api';
import { openCashDrawer } from '../lib/cashDrawer';
import { printReceipt, type Receipt } from '../lib/printer';
import { useStoreSettings } from '../lib/useStoreSettings';
import ServerConfigModal from '../components/ServerConfigModal';
import ChangePasswordModal from '../components/ChangePasswordModal';

interface CartItem {
  key: string;
  batchId: string;
  productId: string;
  barcode: string;
  name: string;
  batchNo: string;
  expiryDate: string | null;
  daysLeft: number | null;
  unit: string;
  unitPrice: string;
  qty: number;
  stockLeft: number; // 扫码时快照的批次剩余;仅前端软上限,以服务端为准
  nearExpiry: boolean;
}

const PAYMENT_META: Record<
  PaymentMethod,
  { label: string; color: string; icon: React.ReactNode; hotkey: string }
> = {
  CASH: { label: '现金', color: '#0958d9', icon: <DollarOutlined />, hotkey: 'F9' },
  WECHAT: { label: '微信', color: '#22c55e', icon: <WechatOutlined />, hotkey: 'F10' },
  ALIPAY: { label: '支付宝', color: '#0ea5e9', icon: <AlipayCircleOutlined />, hotkey: 'F11' },
};

export default function CheckoutPage() {
  const nav = useNavigate();
  const user = getCurrentUser();
  const store = useStoreSettings();

  const [items, setItems] = useState<CartItem[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [barcode, setBarcode] = useState('');
  const [scanning, setScanning] = useState(false);

  // 收款弹窗状态
  const [payOpen, setPayOpen] = useState(false);
  const [payMethod, setPayMethod] = useState<PaymentMethod>('CASH');
  const [payAmount, setPayAmount] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 最近一单快照仅在结账瞬间用于自动打印;补打改为从服务端拉最近订单选择

  // 结账成功弹窗(受控;命令式 Modal.success 的 autoFocus 在 pay 弹窗关闭动画中不稳)
  const [successInfo, setSuccessInfo] = useState<{
    orderId: string;
    totalAmount: string;
    paidAmount: string;
    change: string;
    paymentMethod: PaymentMethod;
    shouldOpenDrawer: boolean;
    autoPrinted: boolean;
  } | null>(null);
  const successOkRef = useRef<HTMLButtonElement>(null);

  // 补打小票弹窗
  const [reprintOpen, setReprintOpen] = useState(false);
  const [reprintSelected, setReprintSelected] = useState<string | null>(null);
  const [reprintingId, setReprintingId] = useState<string | null>(null);

  const barcodeRef = useRef<InputRef>(null);
  const payAmountRef = useRef<HTMLInputElement>(null);
  const scanBusyRef = useRef(false); // 扫码枪高频回车防重入

  const focusBarcode = useCallback(() => {
    setTimeout(() => barcodeRef.current?.focus({ cursor: 'all' }), 0);
  }, []);

  useEffect(() => {
    focusBarcode();
  }, [focusBarcode]);

  const total = useMemo(
    () =>
      items.reduce(
        (acc, it) => acc.plus(new Decimal(it.unitPrice).mul(it.qty)),
        new Decimal(0),
      ),
    [items],
  );
  const totalStr = total.toFixed(2);
  const totalQty = items.reduce((s, it) => s + it.qty, 0);

  const change = useMemo(() => {
    if (payAmount == null) return null;
    const p = new Decimal(payAmount);
    if (p.lt(total)) return null;
    return p.minus(total).toFixed(2);
  }, [payAmount, total]);

  // 加入购物车,已有相同批次则 qty+1;并选中该行
  const addToCart = useCallback((result: ScanResult) => {
    if (!result.product || !result.batch) return;
    const b = result.batch;
    const p = result.product;
    const nearExpiry = result.code === 'NEAR_EXPIRY';

    setItems((prev) => {
      const idx = prev.findIndex((it) => it.batchId === b.id);
      if (idx >= 0) {
        const cur = prev[idx];
        if (cur.qty + 1 > cur.stockLeft) {
          message.warning(`批次库存仅 ${cur.stockLeft},无法继续增加`);
          setSelectedKey(cur.key);
          return prev;
        }
        const next = [...prev];
        next[idx] = { ...cur, qty: cur.qty + 1 };
        setSelectedKey(cur.key);
        return next;
      }
      const item: CartItem = {
        key: `${b.id}-${Date.now()}`,
        batchId: b.id,
        productId: p.id,
        barcode: p.barcode,
        name: p.name,
        batchNo: b.batchNo,
        expiryDate: b.expiryDate,
        daysLeft: b.daysLeft,
        unit: p.unit,
        unitPrice: p.salePrice,
        qty: 1,
        stockLeft: b.quantity,
        nearExpiry,
      };
      setSelectedKey(item.key);
      return [...prev, item];
    });
  }, []);

  const handleScan = useCallback(
    async (raw: string) => {
      const code = raw.trim();
      if (!code) return;
      if (scanBusyRef.current) return;
      scanBusyRef.current = true;
      setScanning(true);
      try {
        const res = await scan(code);
        switch (res.code) {
          case 'OK':
            addToCart(res);
            break;
          case 'NEAR_EXPIRY': {
            const b = res.batch!;
            // 扫码触发的弹窗:焦点仍在扫码框,需要 blur 让 Modal 抓到键盘
            (document.activeElement as HTMLElement | null)?.blur?.();
            Modal.confirm({
              title: '临期商品·请二次确认',
              content: (
                <div>
                  <div>
                    <b>{res.product?.name}</b>({b.batchNo})
                  </div>
                  <div style={{ marginTop: 6 }}>
                    到期日 <Tag color="orange">{b.expiryDate}</Tag>
                    还剩 <Tag color="orange">{b.daysLeft} 天</Tag>
                  </div>
                  <div style={{ marginTop: 6 }}>确认加入购物车?</div>
                </div>
              ),
              okText: '加入 (Enter)',
              cancelText: '取消 (Esc)',
              autoFocusButton: 'ok',
              onOk: () => addToCart(res),
              afterClose: focusBarcode,
            });
            break;
          }
          case 'EXPIRED': {
            const b = res.batch!;
            (document.activeElement as HTMLElement | null)?.blur?.();
            Modal.error({
              title: '批次已过期·禁止销售',
              content: `${res.product?.name}(${b.batchNo}) 到期日 ${b.expiryDate},请先在后台报损。`,
              okText: '知道了 (Enter)',
              okButtonProps: { autoFocus: true },
              afterClose: focusBarcode,
            });
            break;
          }
          case 'OUT_OF_STOCK':
            message.warning(res.message || '该商品已无库存');
            break;
          case 'NOT_FOUND':
            message.error(res.message || `未找到商品:${code}`);
            break;
        }
      } catch (e: any) {
        const raw = e?.response?.data?.message;
        const msg = Array.isArray(raw) ? raw.join('；') : raw ?? e?.message ?? '扫码失败';
        message.error(msg);
      } finally {
        scanBusyRef.current = false;
        setScanning(false);
        setBarcode('');
        focusBarcode();
      }
    },
    [addToCart, focusBarcode],
  );

  const changeQty = (key: string, qty: number) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.key !== key) return it;
        const q = Math.max(1, Math.min(qty, it.stockLeft));
        return { ...it, qty: q };
      }),
    );
  };

  const removeItem = useCallback(
    (key: string) => {
      setItems((prev) => {
        const idx = prev.findIndex((it) => it.key === key);
        if (idx < 0) return prev;
        const next = prev.filter((it) => it.key !== key);
        const fallback = next[idx] ?? next[idx - 1] ?? null;
        setSelectedKey(fallback?.key ?? null);
        return next;
      });
      focusBarcode();
    },
    [focusBarcode],
  );

  // 二次确认删除:弹窗聚焦到"删除"按钮,Enter 确认 / Esc 取消
  const confirmRemoveItem = useCallback(
    (key: string) => {
      const it = items.find((x) => x.key === key);
      if (!it) return;
      (document.activeElement as HTMLElement | null)?.blur?.();
      Modal.confirm({
        title: '删除该商品?',
        content: (
          <div>
            <div>
              <b>{it.name}</b> × {it.qty}
            </div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              批次 {it.batchNo} · ¥
              {new Decimal(it.unitPrice).mul(it.qty).toFixed(2)}
            </Typography.Text>
          </div>
        ),
        okText: '删除 (Enter)',
        okButtonProps: { danger: true, autoFocus: true },
        autoFocusButton: 'ok',
        cancelText: '取消 (Esc)',
        onOk: () => removeItem(key),
        afterClose: focusBarcode,
      });
    },
    [items, removeItem, focusBarcode],
  );

  // 选中行 +/- 数量;减到 1 之后再按 - 会走删除二次确认
  const bumpSelectedQty = useCallback(
    (delta: number) => {
      if (!selectedKey) return;
      const cur = items.find((it) => it.key === selectedKey);
      if (!cur) return;
      const target = cur.qty + delta;
      if (target <= 0) {
        confirmRemoveItem(selectedKey);
        return;
      }
      if (target > cur.stockLeft) {
        message.warning(`批次库存仅 ${cur.stockLeft}`);
        return;
      }
      setItems((prev) =>
        prev.map((it) =>
          it.key === selectedKey ? { ...it, qty: target } : it,
        ),
      );
    },
    [selectedKey, items, confirmRemoveItem],
  );

  const moveSelection = useCallback(
    (dir: 'up' | 'down' | 'home' | 'end') => {
      setItems((prev) => {
        if (prev.length === 0) {
          setSelectedKey(null);
          return prev;
        }
        const curIdx = selectedKey
          ? prev.findIndex((it) => it.key === selectedKey)
          : -1;
        let next: number;
        if (dir === 'home') next = 0;
        else if (dir === 'end') next = prev.length - 1;
        else if (dir === 'up') next = curIdx <= 0 ? 0 : curIdx - 1;
        else next = curIdx < 0 ? 0 : Math.min(curIdx + 1, prev.length - 1);
        setSelectedKey(prev[next].key);
        return prev;
      });
    },
    [selectedKey],
  );

  const clearCart = () => {
    if (items.length === 0) return;
    (document.activeElement as HTMLElement | null)?.blur?.();
    Modal.confirm({
      title: '清空购物车?',
      content: '所有已扫商品会被移除',
      okText: '清空 (Enter)',
      okButtonProps: { danger: true, autoFocus: true },
      autoFocusButton: 'ok',
      cancelText: '取消 (Esc)',
      onOk: () => {
        setItems([]);
        setSelectedKey(null);
      },
      afterClose: focusBarcode,
    });
  };

  // 打开收款弹窗:非现金默认预填应收金额(扫码/插件回填也可覆盖)
  const openPayModal = useCallback(
    (method: PaymentMethod) => {
      if (items.length === 0) {
        message.warning('购物车为空');
        return;
      }
      setPayMethod(method);
      // 现金留空由收银员输入;扫码支付预填应收金额,平台回调也回车即可
      setPayAmount(method === 'CASH' ? null : Number(total.toFixed(2)));
      setPayOpen(true);
      // Modal 打开后聚焦到金额输入(等 DOM 挂载)
      setTimeout(() => payAmountRef.current?.focus(), 100);
    },
    [items.length, total],
  );

  const closePayModal = useCallback(() => {
    setPayOpen(false);
    setPayAmount(null);
    focusBarcode();
  }, [focusBarcode]);

  // 打印小票(打印失败不阻断收银,只在角落 message 提示)
  const doPrint = useCallback(
    async (receipt: Receipt) => {
      try {
        const r = await printReceipt(receipt, {
          allowBrowserFallback: store.allowBrowserPrint,
        });
        if (!r.ok) {
          message.warning(`打印失败:${r.error ?? '未知错误'},可按 P 补打`);
        }
      } catch (e: any) {
        message.warning(`打印失败:${e?.message ?? e},可按 P 补打`);
      }
    },
    [store.allowBrowserPrint],
  );

  const doCheckout = useCallback(async () => {
    if (items.length === 0) {
      message.warning('购物车为空');
      return;
    }
    if (payAmount == null || new Decimal(payAmount).lt(total)) {
      message.warning(`实收金额需 ≥ ¥${totalStr}`);
      return;
    }
    setSubmitting(true);
    try {
      const res = await checkout({
        items: items.map((it) => ({
          batchId: it.batchId,
          qty: it.qty,
          unitPrice: it.unitPrice,
        })),
        paidAmount: new Decimal(payAmount).toFixed(2),
        paymentMethod: payMethod,
      });

      // 现金且有找零 → 开钱箱
      const shouldOpenDrawer =
        payMethod === 'CASH' && new Decimal(res.change).gt(0);
      if (shouldOpenDrawer) {
        openCashDrawer({
          orderId: res.orderId,
          totalAmount: res.totalAmount,
          paidAmount: new Decimal(payAmount).toFixed(2),
          change: res.change,
          paymentMethod: payMethod,
        }).catch(() => {
          /* 已在内部兜底 */
        });
      }

      // 构造小票快照(此时 items 还没清)
      const receipt: Receipt = {
        orderId: res.orderId,
        storeName: store.storeName,
        storeAddress: store.address || undefined,
        storePhone: store.phone || undefined,
        storeTaxId: store.taxId || undefined,
        cashierName: user?.displayName || user?.username || 'cashier',
        printedAt: new Date(),
        items: items.map((it) => ({
          name: it.name,
          qty: it.qty,
          unit: it.unit,
          unitPrice: it.unitPrice,
          subtotal: new Decimal(it.unitPrice).mul(it.qty).toFixed(2),
        })),
        totalAmount: res.totalAmount,
        paidAmount: new Decimal(payAmount).toFixed(2),
        change: res.change,
        paymentMethod: payMethod,
        footer: store.receiptFooter,
        widthMm: store.receiptWidthMm === 58 ? 58 : 80,
      };
      // 是否自动打印由店铺配置决定;补打入口独立走服务端最近订单
      const autoPrinted = store.autoPrintReceipt;
      if (autoPrinted) {
        doPrint(receipt);
      }

      setPayOpen(false);
      setPayAmount(null);
      setItems([]);
      setSelectedKey(null);

      // 先把焦点从 pay 弹窗里的 InputNumber 收回来
      (document.activeElement as HTMLElement | null)?.blur?.();

      // 用受控 Modal 显示成功;这样能可靠地手动 focus OK 按钮
      setSuccessInfo({
        orderId: res.orderId,
        totalAmount: res.totalAmount,
        paidAmount: new Decimal(payAmount).toFixed(2),
        change: res.change,
        paymentMethod: payMethod,
        shouldOpenDrawer,
        autoPrinted,
      });
    } catch (e: any) {
      const raw = e?.response?.data?.message;
      const msg = Array.isArray(raw) ? raw.join('；') : raw ?? e?.message ?? '结账失败';
      Modal.error({
        title: '结账失败',
        content: msg,
        okText: '知道了 (Enter)',
        okButtonProps: { autoFocus: true },
        // 保留 pay 弹窗让用户调整金额重试
      });
    } finally {
      setSubmitting(false);
    }
  }, [focusBarcode, items, payAmount, payMethod, total, totalStr, user, doPrint, store]);

  // 成功弹窗打开后,手动把焦点扣到 OK 按钮,并订阅 Enter 关闭
  useEffect(() => {
    if (!successInfo) return;
    const t = setTimeout(() => {
      successOkRef.current?.focus();
    }, 50);
    return () => clearTimeout(t);
  }, [successInfo]);

  const closeSuccess = useCallback(() => {
    setSuccessInfo(null);
    focusBarcode();
  }, [focusBarcode]);

  // 补打:打开选择器时拉最近 20 单
  const recentQ = useQuery({
    queryKey: ['recent-orders-for-reprint'],
    queryFn: () => recentOrders(20),
    enabled: reprintOpen,
    staleTime: 0, // 每次打开都拉最新
  });

  // 打开时默认选中最近一单
  useEffect(() => {
    if (reprintOpen && recentQ.data && recentQ.data.length > 0 && !reprintSelected) {
      setReprintSelected(recentQ.data[0].id);
    }
  }, [reprintOpen, recentQ.data, reprintSelected]);

  const openReprint = useCallback(() => {
    setReprintSelected(null);
    setReprintOpen(true);
  }, []);

  const closeReprint = useCallback(() => {
    setReprintOpen(false);
    setReprintingId(null);
    focusBarcode();
  }, [focusBarcode]);

  // 从一单历史订单构造 Receipt(用当前 store 配置)
  const buildReceiptFromOrder = useCallback(
    (o: RecentOrder): Receipt => ({
      orderId: o.id,
      storeName: store.storeName,
      storeAddress: store.address || undefined,
      storePhone: store.phone || undefined,
      storeTaxId: store.taxId || undefined,
      cashierName: o.cashier.displayName || o.cashier.username,
      printedAt: new Date(),
      items: o.items.map((it) => ({
        name: it.product.name,
        qty: it.qty,
        unit: it.product.unit,
        unitPrice: it.unitPrice,
        subtotal: it.subtotal,
      })),
      totalAmount: o.totalAmount,
      paidAmount: o.paidAmount,
      change: new Decimal(o.paidAmount).minus(o.totalAmount).toFixed(2),
      paymentMethod: o.paymentMethod,
      footer: store.receiptFooter,
      widthMm: store.receiptWidthMm === 58 ? 58 : 80,
    }),
    [store],
  );

  const confirmReprint = useCallback(async () => {
    const id = reprintSelected;
    if (!id) return;
    const order = recentQ.data?.find((o) => o.id === id);
    if (!order) return;
    setReprintingId(id);
    try {
      await doPrint(buildReceiptFromOrder(order));
      message.success('已发送到打印机');
      closeReprint();
    } finally {
      setReprintingId(null);
    }
  }, [reprintSelected, recentQ.data, buildReceiptFromOrder, doPrint, closeReprint]);

  // 快捷键
  //   F2 聚焦扫码 · F4 清空 · F9 现金 · F10 微信 · F11 支付宝
  //   在弹窗打开时不触发 F9/F10/F11(避免误切支付方式)
  //   购物车导航(仅扫码框为空时,避免和手输条码/枪速回车冲突):
  //     ↑/↓ 上下选行 · Home/End 首末行
  //     Delete/Backspace 删除当前行
  //     + / = 数量+1 · - 数量-1(减到 0 删除)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 成功弹窗打开时,Enter/Esc 一律关掉它,并吞掉这个事件
      if (successInfo) {
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          closeSuccess();
        }
        return;
      }
      if (e.key === 'F2') {
        e.preventDefault();
        if (!payOpen) focusBarcode();
      } else if (e.key === 'F4') {
        e.preventDefault();
        if (!payOpen) clearCart();
      } else if (e.key === 'F9') {
        e.preventDefault();
        if (!payOpen) openPayModal('CASH');
      } else if (e.key === 'F10') {
        e.preventDefault();
        if (!payOpen) openPayModal('WECHAT');
      } else if (e.key === 'F11') {
        e.preventDefault();
        if (!payOpen) openPayModal('ALIPAY');
      } else if (e.key === 'Escape' && payOpen) {
        e.preventDefault();
        closePayModal();
      } else if ((e.key === 'p' || e.key === 'P') && !payOpen && !reprintOpen) {
        // P 打开补打选择器;仅当扫码框为空、非 payOpen 时
        const active = document.activeElement as HTMLElement | null;
        const inEditable =
          active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
        const inNonScanField =
          inEditable && active !== barcodeRef.current?.input;
        if (inNonScanField) return;
        if (barcode.trim() !== '') return;
        e.preventDefault();
        openReprint();
      } else if (reprintOpen) {
        // 补打弹窗:↑↓选择,Enter 确认,Esc 关闭
        const list = recentQ.data ?? [];
        if (list.length === 0) return;
        const curIdx = reprintSelected
          ? list.findIndex((o) => o.id === reprintSelected)
          : -1;
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          const nextIdx = curIdx <= 0 ? 0 : curIdx - 1;
          setReprintSelected(list[nextIdx].id);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          const nextIdx =
            curIdx < 0 ? 0 : Math.min(curIdx + 1, list.length - 1);
          setReprintSelected(list[nextIdx].id);
        } else if (e.key === 'Home') {
          e.preventDefault();
          setReprintSelected(list[0].id);
        } else if (e.key === 'End') {
          e.preventDefault();
          setReprintSelected(list[list.length - 1].id);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          confirmReprint();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          closeReprint();
        }
      } else if (!payOpen) {
        // 购物车导航:仅当扫码框为空(未在手输条码)时生效
        // 编辑数量的 InputNumber 输入时也应该让它处理自身的方向/退格
        const active = document.activeElement as HTMLElement | null;
        const inEditableField =
          active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
        const scanBoxEmpty = barcode.trim() === '';
        // 扫码框本身也是 INPUT,但当它空时我们希望这些键做导航
        const inNonScanField =
          inEditableField && active !== barcodeRef.current?.input;

        if (inNonScanField) return;
        if (!scanBoxEmpty) return;
        if (items.length === 0) return;

        switch (e.key) {
          case 'ArrowUp':
            e.preventDefault();
            moveSelection('up');
            break;
          case 'ArrowDown':
            e.preventDefault();
            moveSelection('down');
            break;
          case 'Home':
            e.preventDefault();
            moveSelection('home');
            break;
          case 'End':
            e.preventDefault();
            moveSelection('end');
            break;
          case 'Delete':
          case 'Backspace':
            if (selectedKey) {
              e.preventDefault();
              confirmRemoveItem(selectedKey);
            }
            break;
          case '+':
          case '=':
            if (selectedKey) {
              e.preventDefault();
              bumpSelectedQty(1);
            }
            break;
          case '-':
            if (selectedKey) {
              e.preventDefault();
              bumpSelectedQty(-1);
            }
            break;
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    items,
    payOpen,
    total,
    barcode,
    selectedKey,
    successInfo,
    closeSuccess,
    reprintOpen,
    reprintSelected,
    recentQ.data,
    openReprint,
    closeReprint,
    confirmReprint,
  ]);

  const logout = () => {
    clearSession();
    nav('/login', { replace: true });
  };

  const [serverCfgOpen, setServerCfgOpen] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);

  const meta = PAYMENT_META[payMethod];

  return (
    <Layout style={{ minHeight: '100vh', background: '#0f172a' }}>
      <Layout.Header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#111827',
          color: '#fff',
          padding: '0 24px',
        }}
      >
        <Space size="middle">
          <ThunderboltOutlined style={{ fontSize: 20, color: '#facc15' }} />
          <span style={{ fontSize: 18, fontWeight: 600 }}>
            {store.storeName} · 收银台
          </span>
          <Tag color="blue" style={{ marginLeft: 8 }}>
            {user?.displayName || user?.username}
          </Tag>
        </Space>
        <Space>
          <Tooltip
            title={
              <div style={{ lineHeight: 1.8 }}>
                F2 聚焦扫码 · F4 清空
                <br />
                F9 现金 · F10 微信 · F11 支付宝
                <br />
                ↑/↓ 选行 · Del/Backspace 删行(需确认)
                <br />
                +/- 数量增减(减到 0 弹删除确认)
                <br />
                P 补打小票(从最近订单选择)
              </div>
            }
          >
            <Tag color="gold">快捷键</Tag>
          </Tooltip>
          <Button
            type="text"
            icon={<PrinterOutlined />}
            style={{ color: '#fff' }}
            onClick={openReprint}
          >
            补打小票 (P)
          </Button>
          {/* 收银台"修改密码"入口暂时隐藏 —— 员工在忙时容易误点,
              且改完会强制登出,可能中断当前开单。后台"账号管理"可以由老板统一重置。
              以后要恢复,把下面这段解开就行,ChangePasswordModal 组件仍然挂着。*/}
          {/*
          <Button
            type="text"
            icon={<KeyOutlined />}
            style={{ color: '#fff' }}
            onClick={() => setPwdOpen(true)}
            title="修改我的密码"
          />
          */}
          <Button
            type="text"
            icon={<SettingOutlined />}
            style={{ color: '#fff' }}
            onClick={() => setServerCfgOpen(true)}
            title="修改服务器地址"
          />
          <Button
            type="text"
            icon={<LogoutOutlined />}
            style={{ color: '#fff' }}
            onClick={logout}
          >
            退出
          </Button>
        </Space>
      </Layout.Header>

      <Layout.Content style={{ padding: 16 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 380px',
            gap: 16,
            height: 'calc(100vh - 96px)',
          }}
        >
          {/* 左:扫码 + 购物车 */}
          <Card
            styles={{ body: { display: 'flex', flexDirection: 'column', height: '100%' } }}
            style={{ height: '100%' }}
          >
            <Space.Compact style={{ width: '100%' }}>
              <Input
                ref={barcodeRef}
                size="large"
                prefix={<ScanOutlined />}
                placeholder="扫描或输入条码,回车加入购物车 (F2 聚焦此处)"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                onPressEnter={() => handleScan(barcode)}
                disabled={scanning}
                allowClear
              />
              <Button
                size="large"
                type="primary"
                loading={scanning}
                onClick={() => handleScan(barcode)}
              >
                加入
              </Button>
            </Space.Compact>

            <Divider style={{ margin: '12px 0' }} />

            {items.length > 0 && (
              <Typography.Paragraph
                type="secondary"
                style={{ marginBottom: 8, fontSize: 12 }}
              >
                <Tag>↑↓</Tag>选行 <Tag>Del</Tag>删除 <Tag>+/-</Tag>数量
                (扫码框有内容时不响应,继续输入条码即可)
              </Typography.Paragraph>
            )}

            <div style={{ flex: 1, overflow: 'auto' }}>
              <Table
                size="middle"
                rowKey="key"
                dataSource={items}
                pagination={false}
                rowClassName={(r) =>
                  r.key === selectedKey ? 'pos-row-selected' : ''
                }
                onRow={(r) => ({
                  onClick: () => setSelectedKey(r.key),
                })}
                locale={{
                  emptyText: (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description="购物车为空,请扫码"
                    />
                  ),
                }}
                columns={[
                  {
                    title: '#',
                    width: 44,
                    align: 'center',
                    render: (_, __, idx) => (
                      <Typography.Text
                        strong={items[idx]?.key === selectedKey}
                        style={{
                          color: items[idx]?.key === selectedKey ? '#0958d9' : '#8c8c8c',
                        }}
                      >
                        {idx + 1}
                      </Typography.Text>
                    ),
                  },
                  {
                    title: '商品',
                    dataIndex: 'name',
                    render: (_, r) => (
                      <div>
                        <div style={{ fontWeight: 600 }}>{r.name}</div>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {r.barcode} · 批次 {r.batchNo}
                        </Typography.Text>
                      </div>
                    ),
                  },
                  {
                    title: '到期',
                    dataIndex: 'expiryDate',
                    width: 130,
                    render: (v: string | null, r) => {
                      // 无保质期商品:后端 expiryDate/daysLeft 都返回 null,不显示"剩 X 天"
                      if (!v || r.daysLeft == null) {
                        return (
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            无保质期
                          </Typography.Text>
                        );
                      }
                      return (
                        <Space direction="vertical" size={0}>
                          <span>{v}</span>
                          {r.nearExpiry ? (
                            <Tag color="orange" style={{ marginRight: 0 }}>
                              剩 {r.daysLeft} 天
                            </Tag>
                          ) : (
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                              剩 {r.daysLeft} 天
                            </Typography.Text>
                          )}
                        </Space>
                      );
                    },
                  },
                  {
                    title: '单价',
                    dataIndex: 'unitPrice',
                    width: 90,
                    align: 'right',
                    render: (v: string, r) => `¥${v}/${r.unit}`,
                  },
                  {
                    title: '数量',
                    dataIndex: 'qty',
                    width: 110,
                    render: (v: number, r) => (
                      <InputNumber
                        min={1}
                        max={r.stockLeft}
                        value={v}
                        onChange={(n) => n && changeQty(r.key, n)}
                        style={{ width: '100%' }}
                      />
                    ),
                  },
                  {
                    title: '小计',
                    width: 100,
                    align: 'right',
                    render: (_, r) => (
                      <b>¥{new Decimal(r.unitPrice).mul(r.qty).toFixed(2)}</b>
                    ),
                  },
                  {
                    title: '',
                    width: 56,
                    render: (_, r) => (
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => confirmRemoveItem(r.key)}
                      />
                    ),
                  },
                ]}
              />
            </div>

            <Divider style={{ margin: '8px 0' }} />
            <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
              <Button icon={<ClearOutlined />} onClick={clearCart} disabled={!items.length}>
                清空 (F4)
              </Button>
            </Space>
          </Card>

          {/* 右:应收 + 收款按钮 */}
          <Card
            style={{ height: '100%' }}
            styles={{ body: { display: 'flex', flexDirection: 'column', height: '100%' } }}
          >
            <Statistic
              title={`应收 (${totalQty} 件)`}
              value={totalStr}
              precision={2}
              prefix="¥"
              valueStyle={{ fontSize: 44, color: '#0958d9', fontWeight: 700 }}
            />
            <Divider />

            <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
              选择收款方式(可用快捷键):
            </Typography.Paragraph>

            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              {(Object.keys(PAYMENT_META) as PaymentMethod[]).map((m) => {
                const info = PAYMENT_META[m];
                return (
                  <Button
                    key={m}
                    block
                    size="large"
                    icon={info.icon}
                    onClick={() => openPayModal(m)}
                    disabled={items.length === 0}
                    style={{
                      height: 64,
                      fontSize: 20,
                      background: items.length === 0 ? undefined : info.color,
                      borderColor: info.color,
                      color: items.length === 0 ? undefined : '#fff',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0 20px',
                    }}
                  >
                    <span>{info.label}收款</span>
                    <Tag
                      style={{
                        marginRight: 0,
                        background: 'rgba(255,255,255,0.25)',
                        borderColor: 'transparent',
                        color: '#fff',
                        fontWeight: 600,
                      }}
                    >
                      {info.hotkey}
                    </Tag>
                  </Button>
                );
              })}
            </Space>
          </Card>
        </div>
      </Layout.Content>

      {/* 收款弹窗 */}
      <Modal
        open={payOpen}
        onCancel={closePayModal}
        maskClosable={false}
        destroyOnClose
        footer={null}
        width={480}
        title={
          <Space>
            <span style={{ color: meta.color, fontSize: 20 }}>{meta.icon}</span>
            <span style={{ fontSize: 18 }}>{meta.label}收款</span>
          </Space>
        }
      >
        <div style={{ padding: '8px 4px' }}>
          <div style={{ marginBottom: 16 }}>
            <Typography.Text type="secondary">应收</Typography.Text>
            <div style={{ fontSize: 40, fontWeight: 700, color: meta.color, lineHeight: 1.1 }}>
              ¥{totalStr}
            </div>
          </div>

          <Typography.Text strong style={{ display: 'block', marginBottom: 6 }}>
            {payMethod === 'CASH' ? '收到现金' : '收款金额(平台回调后自动回填,可回车确认)'}
          </Typography.Text>
          <InputNumber
            ref={payAmountRef as any}
            size="large"
            autoFocus
            min={0}
            step={payMethod === 'CASH' ? 1 : 0.01}
            precision={2}
            value={payAmount}
            onChange={(v) => setPayAmount(v ?? null)}
            onPressEnter={doCheckout}
            style={{ width: '100%', fontSize: 22 }}
            prefix="¥"
            placeholder={`≥ ${totalStr}`}
          />

          {payMethod === 'CASH' && (
            <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
              提示:实收多于应收将自动弹开钱箱。
            </Typography.Paragraph>
          )}
          {payMethod !== 'CASH' && (
            <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
              提示:{meta.label}插件收款成功后会回填金额并触发回车,无需手动操作。
            </Typography.Paragraph>
          )}

          {change != null && (
            <div
              style={{
                marginTop: 16,
                background: '#fff7e6',
                border: '1px solid #ffd591',
                borderRadius: 8,
                padding: '10px 14px',
              }}
            >
              <Typography.Text type="secondary">
                {payMethod === 'CASH' ? '找零' : '溢收'}
              </Typography.Text>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#c41d7f' }}>
                ¥{change}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            <Button size="large" block onClick={closePayModal}>
              取消 (Esc)
            </Button>
            <Button
              type="primary"
              size="large"
              block
              loading={submitting}
              onClick={doCheckout}
              disabled={
                payAmount == null || new Decimal(payAmount || 0).lt(total)
              }
              style={{ background: meta.color, borderColor: meta.color }}
            >
              确认收款 (Enter)
            </Button>
          </div>
        </div>
      </Modal>

      {/* 结账成功弹窗(受控;确保 Enter 能可靠关闭并 refocus 扫码框) */}
      <Modal
        open={!!successInfo}
        onCancel={closeSuccess}
        onOk={closeSuccess}
        maskClosable={false}
        keyboard={true}
        width={460}
        title={
          <Space>
            <span
              style={{
                display: 'inline-block',
                width: 22,
                height: 22,
                lineHeight: '22px',
                textAlign: 'center',
                borderRadius: '50%',
                background: '#52c41a',
                color: '#fff',
                fontWeight: 700,
              }}
            >
              ✓
            </span>
            <span style={{ fontSize: 18 }}>结账成功</span>
          </Space>
        }
        footer={[
          <Button
            key="ok"
            ref={successOkRef}
            type="primary"
            size="large"
            onClick={closeSuccess}
          >
            确定 (Enter)
          </Button>,
        ]}
      >
        {successInfo && (
          <div style={{ padding: '4px 0' }}>
            <div>
              订单号 <code>{successInfo.orderId}</code>
            </div>
            <div style={{ marginTop: 8 }}>
              <Tag color={PAYMENT_META[successInfo.paymentMethod].color}>
                {PAYMENT_META[successInfo.paymentMethod].label}
              </Tag>
              应收 <b>¥{successInfo.totalAmount}</b>
              {successInfo.paymentMethod === 'CASH' && (
                <>
                  {' '}
                  · 实收 <b>¥{successInfo.paidAmount}</b> · 找零{' '}
                  <b style={{ color: '#c41d7f' }}>¥{successInfo.change}</b>
                </>
              )}
            </div>
            {successInfo.shouldOpenDrawer && (
              <div style={{ marginTop: 8, color: '#0958d9' }}>💰 钱箱已弹出</div>
            )}
            {successInfo.autoPrinted ? (
              <div style={{ marginTop: 8, color: '#389e0d' }}>
                🧾 小票已发送到打印机(可按 P 补打)
              </div>
            ) : (
              <div style={{ marginTop: 8, color: '#8c8c8c' }}>
                🧾 自动打印已关闭(可按 P 手动打印)
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* 补打小票选择器 */}
      <Modal
        open={reprintOpen}
        onCancel={closeReprint}
        onOk={confirmReprint}
        okText="打印 (Enter)"
        cancelText="取消 (Esc)"
        okButtonProps={{
          disabled: !reprintSelected || recentQ.isLoading,
          loading: !!reprintingId,
        }}
        maskClosable={false}
        keyboard={true}
        width={720}
        title={
          <Space>
            <PrinterOutlined />
            <span style={{ fontSize: 18 }}>补打小票</span>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              ↑↓ 选择 · Enter 打印 · Esc 关闭
            </Typography.Text>
          </Space>
        }
      >
        {recentQ.isLoading ? (
          <div style={{ textAlign: 'center', padding: 32 }}>
            <Spin />
          </div>
        ) : (recentQ.data ?? []).length === 0 ? (
          <Empty description="暂无订单" />
        ) : (
          <div style={{ maxHeight: '60vh', overflow: 'auto' }}>
            <Table<RecentOrder>
              size="small"
              rowKey="id"
              dataSource={recentQ.data ?? []}
              pagination={false}
              rowClassName={(r) =>
                r.id === reprintSelected ? 'pos-row-selected' : ''
              }
              onRow={(r) => ({
                onClick: () => setReprintSelected(r.id),
                onDoubleClick: () => {
                  setReprintSelected(r.id);
                  confirmReprint();
                },
                style: { cursor: 'pointer' },
              })}
              columns={[
                {
                  title: '时间',
                  dataIndex: 'createdAt',
                  width: 150,
                  render: (v: string) => dayjs(v).format('MM-DD HH:mm:ss'),
                },
                {
                  title: '订单号',
                  dataIndex: 'id',
                  width: 220,
                  render: (v: string) => (
                    <Typography.Text style={{ fontSize: 12 }}>
                      <code>{v}</code>
                    </Typography.Text>
                  ),
                },
                {
                  title: '收银员',
                  dataIndex: ['cashier', 'displayName'],
                  width: 100,
                  render: (_, r) =>
                    r.cashier.displayName || r.cashier.username,
                },
                {
                  title: '商品',
                  dataIndex: 'items',
                  render: (_, r) => {
                    const totalQty = r.items.reduce((s, it) => s + it.qty, 0);
                    const first = r.items[0]?.product?.name ?? '';
                    const suffix =
                      r.items.length > 1
                        ? ` 等 ${r.items.length} 项`
                        : '';
                    return (
                      <Typography.Text ellipsis style={{ maxWidth: 200 }}>
                        {first}
                        {suffix} · {totalQty} 件
                      </Typography.Text>
                    );
                  },
                },
                {
                  title: '支付',
                  dataIndex: 'paymentMethod',
                  width: 70,
                  render: (m: PaymentMethod) => (
                    <Tag color={PAYMENT_META[m].color}>
                      {PAYMENT_META[m].label}
                    </Tag>
                  ),
                },
                {
                  title: '金额',
                  dataIndex: 'totalAmount',
                  width: 90,
                  align: 'right',
                  render: (v: string) => <b>¥{v}</b>,
                },
              ]}
            />
          </div>
        )}
      </Modal>
      <ServerConfigModal
        open={serverCfgOpen}
        onClose={() => setServerCfgOpen(false)}
      />
      <ChangePasswordModal open={pwdOpen} onClose={() => setPwdOpen(false)} />
    </Layout>
  );
}
