import {
  Button,
  Card,
  DatePicker,
  Dialog,
  Input,
  List,
  Stepper,
  Tag,
  Toast,
} from 'antd-mobile';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import Scanner from '../components/Scanner';
import {
  createBatch,
  findProductByBarcode,
  type Product,
} from '../lib/sdk';
import {
  clientUuid,
  enqueueInbound,
  findLocalProductByBarcode,
  appendHistory,
} from '../lib/offlineDb';
import { useOffline } from '../lib/OfflineContext';

/**
 * 入库页(支持离线):
 *   - 商品查找:优先本地缓存,联网时再兜底远程
 *   - 提交:在线直接 POST /batches;离线塞 pending_inbounds 队列,联网后自动 replay
 */
export default function InboundPage() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const { online, pending } = useOffline();

  const [product, setProduct] = useState<Product | null>(null);
  const [productionDate, setProductionDate] = useState<Date | null>(
    dayjs().startOf('day').toDate(),
  );
  const [shelfLifeDays, setShelfLifeDays] = useState(365);
  const [quantity, setQuantity] = useState(1);
  const [costPrice, setCostPrice] = useState('');
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [scannerKey, setScannerKey] = useState(0);

  const reset = () => {
    setProduct(null);
    setProductionDate(dayjs().startOf('day').toDate());
    setShelfLifeDays(365);
    setQuantity(1);
    setCostPrice('');
    setScannerKey((k) => k + 1);
  };

  const onDetected = async (code: string) => {
    Toast.show({ content: `识别到:${code}`, duration: 800 });
    // 先查本地
    const local = await findLocalProductByBarcode(code);
    if (local) {
      setProduct(local);
      if (local.costPrice) setCostPrice(local.costPrice);
      return;
    }
    // 本地没有 → 在线再查一次远程(兼容"离线时刚建过的商品没同步下来")
    if (online) {
      try {
        const p = await findProductByBarcode(code);
        if (!p) {
          Dialog.alert({
            title: '未找到商品',
            content: `条码 ${code} 未登记。请先在后台创建商品,再入库。`,
            confirmText: '知道了',
          });
          setScannerKey((k) => k + 1);
          return;
        }
        setProduct(p);
        if (p.costPrice) setCostPrice(p.costPrice);
      } catch {
        setScannerKey((k) => k + 1);
      }
    } else {
      Dialog.alert({
        title: '本地未找到该商品',
        content: (
          <div>
            <div>条码 {code} 不在离线缓存里。</div>
            <div style={{ marginTop: 6, color: '#8c8c8c', fontSize: 12 }}>
              离线状态无法查询新商品;请联网后到"待同步"页手动同步商品数据。
            </div>
          </div>
        ),
        confirmText: '知道了',
      });
      setScannerKey((k) => k + 1);
    }
  };

  const validate = (): string | null => {
    if (!product) return '未选商品';
    // 无保质期分类:跳过日期/保质期校验
    if (product.category?.hasExpiry !== false) {
      if (!productionDate) return '请选择生产日期';
      if (shelfLifeDays <= 0) return '保质期天数需 > 0';
    }
    if (quantity <= 0) return '数量需 > 0';
    if (!costPrice || Number(costPrice) < 0) return '请填成本价';
    return null;
  };

  // 在线路径:直接 POST(同时也写入 upload_history,让员工事后能看到)
  const submitOnline = useMutation({
    mutationFn: async () => {
      const err = validate();
      if (err) throw new Error(err);
      const hasExpiry = product!.category?.hasExpiry !== false;
      const expiry = hasExpiry
        ? dayjs(productionDate!).add(shelfLifeDays, 'day')
        : null;
      const now = Date.now();
      const snapshot = {
        productName: product!.name,
        productBarcode: product!.barcode,
        quantity,
        productionDate: hasExpiry
          ? dayjs(productionDate!).format('YYYY-MM-DD')
          : undefined,
        expiryDate: hasExpiry ? expiry!.format('YYYY-MM-DD') : undefined,
        createdAt: now,
      };
      try {
        const b = await createBatch({
          productId: product!.id,
          productionDate: snapshot.productionDate,
          expiryDate: snapshot.expiryDate,
          quantity,
          costPrice,
        });
        await appendHistory([
          {
            clientId: clientUuid(),
            ...snapshot,
            uploadedAt: Date.now(),
            ok: true,
            batchId: b.id,
            batchNo: b.batchNo,
          },
        ]);
        await pending.refresh();
        return b;
      } catch (e: any) {
        // 在线路径失败,也留一条失败历史,方便员工排查(比如网络断了一半)
        const raw = e?.response?.data?.message;
        const msg = Array.isArray(raw) ? raw.join('；') : raw ?? e?.message ?? '入库失败';
        await appendHistory([
          {
            clientId: clientUuid(),
            ...snapshot,
            uploadedAt: Date.now(),
            ok: false,
            error: String(msg),
          },
        ]);
        await pending.refresh();
        throw e;
      }
    },
    onSuccess: (b) => {
      Toast.show({ icon: 'success', content: `已入库:${b.batchNo}` });
      qc.invalidateQueries({ queryKey: ['near-expiry'] });
      reset();
    },
    onError: (e: any) => {
      const raw = e?.response?.data?.message;
      const msg = Array.isArray(raw) ? raw.join('；') : raw ?? e?.message ?? '入库失败';
      Toast.show({ icon: 'fail', content: msg });
    },
  });

  // 离线路径:入 pending 队列
  const submitOffline = async () => {
    const err = validate();
    if (err) {
      Toast.show({ icon: 'fail', content: err });
      return;
    }
    const hasExpiry = product!.category?.hasExpiry !== false;
    const expiry = hasExpiry
      ? dayjs(productionDate!).add(shelfLifeDays, 'day')
      : null;
    await enqueueInbound({
      clientId: clientUuid(),
      productId: product!.id,
      productName: product!.name,
      productBarcode: product!.barcode,
      productionDate: hasExpiry
        ? dayjs(productionDate!).format('YYYY-MM-DD')
        : undefined,
      expiryDate: hasExpiry ? expiry!.format('YYYY-MM-DD') : undefined,
      quantity,
      costPrice,
      createdAt: Date.now(),
    });
    await pending.refresh();
    Toast.show({
      icon: 'success',
      content: `已入队 · 队列 ${pending.count + 1} 条`,
      duration: 2000,
    });
    reset();
  };

  const doSubmit = () => {
    if (online) submitOnline.mutate();
    else submitOffline();
  };

  const expiryPreview = productionDate
    ? dayjs(productionDate).add(shelfLifeDays, 'day').format('YYYY-MM-DD')
    : '-';

  return (
    <div style={{ padding: 12 }}>
      {!online && (
        <div
          style={{
            background: '#fff7e6',
            border: '1px solid #ffd591',
            color: '#874d00',
            borderRadius: 8,
            padding: '8px 12px',
            marginBottom: 12,
            fontSize: 12,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span>
            当前离线,入库将排队;联网后自动提交。
            {pending.count > 0 && (
              <span style={{ marginLeft: 6 }}>
                队列 <b>{pending.count}</b> 条。
              </span>
            )}
          </span>
          {pending.count > 0 && (
            <span
              style={{
                color: '#1677ff',
                whiteSpace: 'nowrap',
                fontWeight: 600,
              }}
              onClick={() => nav('/pending')}
            >
              查看 →
            </span>
          )}
        </div>
      )}
      {!product ? (
        <Card title="扫描或输入商品条码">
          <Scanner key={scannerKey} onDetected={onDetected} showManualInput />
        </Card>
      ) : (
        <>
          <Card
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>{product.name}</span>
                {!online && <Tag color="warning">离线</Tag>}
              </div>
            }
            extra={
              <span style={{ color: '#1677ff', fontSize: 12 }} onClick={reset}>
                重新扫码
              </span>
            }
          >
            <div style={{ fontSize: 12, color: '#8c8c8c' }}>
              <div>条码 {product.barcode}</div>
              <div>单位 {product.unit} · 售价 ¥{product.salePrice}</div>
            </div>
          </Card>

          <Card style={{ marginTop: 12 }} title="批次信息">
            <List>
              {product.category?.hasExpiry !== false ? (
                <>
                  <List.Item
                    title="生产日期"
                    extra={
                      <span
                        style={{ color: productionDate ? '#333' : '#ccc' }}
                        onClick={() => setDatePickerOpen(true)}
                      >
                        {productionDate
                          ? dayjs(productionDate).format('YYYY-MM-DD')
                          : '请选择'}
                      </span>
                    }
                    onClick={() => setDatePickerOpen(true)}
                    arrow
                  />
                  <List.Item
                    title="保质期(天)"
                    extra={
                      <Stepper
                        min={1}
                        max={3650}
                        step={1}
                        value={shelfLifeDays}
                        onChange={setShelfLifeDays}
                      />
                    }
                  />
                  <List.Item title="到期日预览" extra={<b>{expiryPreview}</b>} />
                </>
              ) : (
                <List.Item
                  title="保质期"
                  extra={<Tag color="default">该分类无保质期</Tag>}
                />
              )}
              <List.Item
                title="入库数量"
                extra={
                  <Stepper
                    min={1}
                    step={1}
                    value={quantity}
                    onChange={setQuantity}
                  />
                }
              />
              <List.Item title="成本单价">
                <Input
                  placeholder="0.00"
                  type="number"
                  value={costPrice}
                  onChange={setCostPrice}
                  style={{ textAlign: 'right' }}
                />
              </List.Item>
            </List>
          </Card>

          <Button
            block
            color={online ? 'primary' : 'warning'}
            size="large"
            style={{ marginTop: 16 }}
            loading={submitOnline.isPending}
            onClick={doSubmit}
          >
            {online ? '提交入库' : '离线排队'}
          </Button>

          <DatePicker
            visible={datePickerOpen}
            value={productionDate ?? new Date()}
            precision="day"
            max={new Date()}
            title="生产日期"
            onClose={() => setDatePickerOpen(false)}
            onConfirm={(v) => setProductionDate(v)}
          />
        </>
      )}
    </div>
  );
}
