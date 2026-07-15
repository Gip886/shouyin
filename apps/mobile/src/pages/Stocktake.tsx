import {
  Button,
  Card,
  Dialog,
  Empty,
  List,
  ProgressBar,
  Stepper,
  Tag,
  Toast,
} from 'antd-mobile';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import Scanner from '../components/Scanner';
import {
  adjustBatch,
  findProductByBarcode,
  listBatchesByProduct,
  type Product,
} from '../lib/sdk';

/**
 * 盘点页:
 *   扫码 → 商品所有 ACTIVE 批次 → 逐批次输入实盘数量 → 一键提交
 * 只对系统数量 !== 实盘数量的批次发 adjust 请求(delta = 实盘 - 系统),reason 固定"盘点调整"
 */
export default function StocktakePage() {
  const qc = useQueryClient();
  const [product, setProduct] = useState<Product | null>(null);
  const [scannerKey, setScannerKey] = useState(0);
  const [actualQty, setActualQty] = useState<Record<string, number>>({});

  const q = useQuery({
    queryKey: ['batches', product?.id],
    queryFn: () => listBatchesByProduct(product!.id),
    enabled: !!product,
  });

  const activeBatches = useMemo(
    () => (q.data ?? []).filter((b) => b.status === 'ACTIVE'),
    [q.data],
  );

  const diffs = useMemo(
    () =>
      activeBatches
        .map((b) => ({
          batch: b,
          actual: actualQty[b.id] ?? b.quantity,
          delta: (actualQty[b.id] ?? b.quantity) - b.quantity,
        }))
        .filter((d) => d.delta !== 0),
    [activeBatches, actualQty],
  );

  const reset = () => {
    setProduct(null);
    setActualQty({});
    setScannerKey((k) => k + 1);
  };

  // 串行提交进度
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
    currentLabel: string;
  } | null>(null);

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
      setActualQty({});
    } catch {
      setScannerKey((k) => k + 1);
    }
  };

  const submit = useMutation({
    // 串行提交:每一条完成后更新进度;单条失败不中断,最后统一报告
    mutationFn: async () => {
      const total = diffs.length;
      setProgress({ done: 0, total, currentLabel: '' });
      const failures: { batchNo: string; message: string }[] = [];
      const succeededIds: string[] = [];

      for (let i = 0; i < diffs.length; i++) {
        const d = diffs[i];
        setProgress({
          done: i,
          total,
          currentLabel: `批次 ${d.batch.batchNo}`,
        });
        try {
          await adjustBatch(d.batch.id, {
            delta: d.delta,
            reason: `盘点调整:系统 ${d.batch.quantity} → 实盘 ${d.actual}`,
          });
          succeededIds.push(d.batch.id);
        } catch (e: any) {
          const raw = e?.response?.data?.message;
          const msg = Array.isArray(raw) ? raw.join('；') : raw ?? e?.message ?? '未知错误';
          failures.push({ batchNo: d.batch.batchNo, message: msg });
        }
      }

      setProgress({ done: total, total, currentLabel: '完成' });
      return { total, failures, succeededIds };
    },
    onSuccess: ({ total, failures, succeededIds }) => {
      qc.invalidateQueries({ queryKey: ['batches'] });
      qc.invalidateQueries({ queryKey: ['near-expiry'] });

      if (failures.length === 0) {
        Toast.show({ icon: 'success', content: `已调整 ${total} 个批次` });
        reset();
      } else {
        // 部分失败:清掉已成功那些的输入,让用户看到剩下要重试的
        setActualQty((prev) => {
          const next = { ...prev };
          succeededIds.forEach((id) => delete next[id]);
          return next;
        });
        Dialog.alert({
          title: `${total - failures.length}/${total} 项已提交`,
          content: (
            <div>
              <div style={{ marginBottom: 8 }}>以下批次调整失败,已保留输入可重试:</div>
              {failures.map((f) => (
                <div key={f.batchNo} style={{ fontSize: 12, color: '#ff4d4f' }}>
                  批次 {f.batchNo}:{f.message}
                </div>
              ))}
            </div>
          ),
          confirmText: '知道了',
        });
      }
      // 稍等再清进度条,让用户看到 100%
      setTimeout(() => setProgress(null), 600);
    },
    onError: (e: any) => {
      setProgress(null);
      Toast.show({ icon: 'fail', content: e?.message ?? '提交失败' });
    },
  });

  const doSubmit = () => {
    if (diffs.length === 0) {
      Toast.show({ content: '所有批次数量一致,无需调整' });
      return;
    }
    Dialog.confirm({
      title: '确认盘点差异?',
      content: (
        <div>
          <div style={{ marginBottom: 8, fontSize: 13 }}>共 {diffs.length} 项调整:</div>
          {diffs.map((d) => (
            <div key={d.batch.id} style={{ fontSize: 12 }}>
              批次 {d.batch.batchNo}:{d.batch.quantity} →{' '}
              <b style={{ color: d.delta > 0 ? '#52c41a' : '#ff4d4f' }}>{d.actual}</b>{' '}
              ({d.delta > 0 ? '+' : ''}
              {d.delta})
            </div>
          ))}
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
        <Card title="扫描商品条码开始盘点">
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
            <Empty description="该商品暂无在售批次" style={{ marginTop: 24 }} />
          ) : (
            <Card style={{ marginTop: 12 }} title={`在售批次(${activeBatches.length})`}>
              <List>
                {activeBatches.map((b) => {
                  const actual = actualQty[b.id] ?? b.quantity;
                  const delta = actual - b.quantity;
                  return (
                    <List.Item
                      key={b.id}
                      title={
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span>批次 {b.batchNo}</span>
                          {delta !== 0 && (
                            <Tag color={delta > 0 ? 'success' : 'danger'}>
                              {delta > 0 ? '+' : ''}
                              {delta}
                            </Tag>
                          )}
                        </div>
                      }
                      description={
                        <span style={{ fontSize: 12 }}>
                          到期 {b.expiryDate} · 系统 {b.quantity}
                        </span>
                      }
                      extra={
                        <Stepper
                          min={0}
                          max={99999}
                          step={1}
                          value={actual}
                          onChange={(v) =>
                            setActualQty((prev) => ({ ...prev, [b.id]: v }))
                          }
                        />
                      }
                    />
                  );
                })}
              </List>
            </Card>
          )}

          {activeBatches.length > 0 && (
            <>
              {progress && (
                <Card style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 13, marginBottom: 8 }}>
                    正在提交 {progress.done}/{progress.total}
                    {progress.currentLabel && (
                      <span style={{ color: '#8c8c8c', marginLeft: 8 }}>
                        · {progress.currentLabel}
                      </span>
                    )}
                  </div>
                  <ProgressBar
                    percent={
                      progress.total === 0
                        ? 0
                        : Math.round((progress.done / progress.total) * 100)
                    }
                    style={{
                      '--fill-color': '#1677ff',
                    }}
                  />
                </Card>
              )}
              <Button
                block
                color="primary"
                size="large"
                style={{ marginTop: 16 }}
                disabled={diffs.length === 0}
                loading={submit.isPending}
                onClick={doSubmit}
              >
                {diffs.length === 0 ? '无差异,无需调整' : `提交 ${diffs.length} 项调整`}
              </Button>
            </>
          )}
        </>
      )}
    </div>
  );
}
