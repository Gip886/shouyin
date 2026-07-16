import {
  Button,
  Card,
  Dialog,
  Empty,
  List,
  Radio,
  Selector,
  Stepper,
  TextArea,
  Toast,
} from 'antd-mobile';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import Scanner from '../components/Scanner';
import {
  adjustBatch,
  findProductByBarcode,
  listBatchesByProduct,
  type Batch,
  type Product,
} from '../lib/sdk';

const PRESET_REASONS = [
  '过期下架',
  '破损/污染',
  '临期让利',
  '盘亏',
  '其他',
];

/**
 * 报损页:
 *   扫码 → 选批次 → 选原因 + 输入数量 → 提交(delta = -数量)
 * 这里报损与"盘点减少"的区别只在 reason 上,底层都是 adjustBatch
 */
export default function ScrapPage() {
  const qc = useQueryClient();
  const [product, setProduct] = useState<Product | null>(null);
  const [scannerKey, setScannerKey] = useState(0);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [scrapQty, setScrapQty] = useState(1);
  const [reasonKey, setReasonKey] = useState<string>(PRESET_REASONS[0]);
  const [customReason, setCustomReason] = useState('');

  const q = useQuery({
    queryKey: ['batches', product?.id],
    queryFn: () => listBatchesByProduct(product!.id),
    enabled: !!product,
  });

  const activeBatches = useMemo(
    () => (q.data ?? []).filter((b) => b.status === 'ACTIVE' && b.quantity > 0),
    [q.data],
  );

  const selectedBatch: Batch | null =
    activeBatches.find((b) => b.id === selectedBatchId) ?? null;

  const reset = () => {
    setProduct(null);
    setSelectedBatchId(null);
    setScrapQty(1);
    setReasonKey(PRESET_REASONS[0]);
    setCustomReason('');
    setScannerKey((k) => k + 1);
  };

  const onDetected = async (code: string) => {
    try {
      const p = await findProductByBarcode(code);
      if (!p) {
        Dialog.alert({
          title: '未找到商品',
          content: `条码 ${code} 未登记`,
          confirmText: '知道了',
        });
        setScannerKey((k) => k + 1);
        return;
      }
      setProduct(p);
      setSelectedBatchId(null);
    } catch {
      setScannerKey((k) => k + 1);
    }
  };

  const submit = useMutation({
    mutationFn: async () => {
      if (!selectedBatch) throw new Error('请选择批次');
      if (scrapQty <= 0) throw new Error('数量需 > 0');
      if (scrapQty > selectedBatch.quantity)
        throw new Error(`超过批次剩余(${selectedBatch.quantity})`);
      const reason = reasonKey === '其他' ? customReason.trim() : reasonKey;
      if (!reason) throw new Error('请填写原因');
      return adjustBatch(selectedBatch.id, {
        delta: -scrapQty,
        reason: `报损:${reason}`,
      });
    },
    onSuccess: () => {
      Toast.show({ icon: 'success', content: '已报损' });
      qc.invalidateQueries({ queryKey: ['batches'] });
      qc.invalidateQueries({ queryKey: ['near-expiry'] });
      reset();
    },
    onError: (e: any) =>
      Toast.show({ icon: 'fail', content: e?.message ?? '提交失败' }),
  });

  const confirmSubmit = () => {
    if (!selectedBatch) return;
    const reason = reasonKey === '其他' ? customReason.trim() : reasonKey;
    Dialog.confirm({
      title: '确认报损?',
      content: (
        <div>
          <div>
            <b>{product?.name}</b>
          </div>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 4 }}>
            批次 {selectedBatch.batchNo} · 到期 {selectedBatch.expiryDate ?? '—'}
          </div>
          <div style={{ marginTop: 8 }}>
            报损 <b style={{ color: '#ff4d4f' }}>{scrapQty}</b> 件 · 原因:{reason || '(空)'}
          </div>
        </div>
      ),
      onConfirm: async () => {
        await submit.mutateAsync();
      },
    });
  };

  return (
    <div style={{ padding: 12 }}>
      {!product ? (
        <Card title="扫描商品条码开始报损">
          <Scanner key={scannerKey} onDetected={onDetected} showManualInput />
        </Card>
      ) : (
        <>
          <Card
            title={product.name}
            extra={
              <span style={{ color: '#1677ff', fontSize: 12 }} onClick={reset}>
                重新扫码
              </span>
            }
          >
            <div style={{ fontSize: 12, color: '#8c8c8c' }}>
              条码 {product.barcode} · 单位 {product.unit}
            </div>
          </Card>

          {q.isLoading ? (
            <div style={{ textAlign: 'center', padding: 24, color: '#999' }}>加载中…</div>
          ) : activeBatches.length === 0 ? (
            <Empty description="该商品暂无可报损批次" style={{ marginTop: 24 }} />
          ) : (
            <>
              <Card style={{ marginTop: 12 }} title="选择批次">
                <Radio.Group
                  value={selectedBatchId ?? ''}
                  onChange={(v) => setSelectedBatchId(String(v))}
                >
                  <List>
                    {activeBatches.map((b) => (
                      <List.Item
                        key={b.id}
                        title={`批次 ${b.batchNo}`}
                        description={
                          <span style={{ fontSize: 12 }}>
                            到期 {b.expiryDate ?? '—'} · 剩 {b.quantity} 件
                          </span>
                        }
                        prefix={<Radio value={b.id} />}
                        onClick={() => setSelectedBatchId(b.id)}
                      />
                    ))}
                  </List>
                </Radio.Group>
              </Card>

              {selectedBatch && (
                <Card style={{ marginTop: 12 }} title="报损信息">
                  <List>
                    <List.Item
                      title="数量"
                      description={`最多 ${selectedBatch.quantity}`}
                      extra={
                        <Stepper
                          min={1}
                          max={selectedBatch.quantity}
                          step={1}
                          value={scrapQty}
                          onChange={setScrapQty}
                        />
                      }
                    />
                    <List.Item title="原因">
                      <Selector
                        options={PRESET_REASONS.map((r) => ({ label: r, value: r }))}
                        value={[reasonKey]}
                        onChange={(v) => v[0] && setReasonKey(v[0])}
                      />
                    </List.Item>
                    {reasonKey === '其他' && (
                      <List.Item>
                        <TextArea
                          placeholder="请描述报损原因"
                          value={customReason}
                          onChange={setCustomReason}
                          maxLength={80}
                          rows={2}
                          showCount
                        />
                      </List.Item>
                    )}
                  </List>
                </Card>
              )}

              <Button
                block
                color="danger"
                size="large"
                style={{ marginTop: 16 }}
                disabled={!selectedBatch}
                loading={submit.isPending}
                onClick={confirmSubmit}
              >
                提交报损
              </Button>
            </>
          )}
        </>
      )}
    </div>
  );
}
