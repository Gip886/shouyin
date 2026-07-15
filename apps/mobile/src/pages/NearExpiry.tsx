import { Card, Dialog, Empty, ErrorBlock, PullToRefresh, Tabs, Tag, Toast } from 'antd-mobile';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { adjustBatch, nearExpiry } from '../lib/sdk';
import type { NearExpiryBatch } from '@shouyin/shared';

const DAYS_TABS = [
  { key: 7, label: '7 天内' },
  { key: 30, label: '30 天内' },
  { key: 90, label: '90 天内' },
];

const URGENCY_COLOR: Record<NearExpiryBatch['urgency'], string> = {
  RED: 'danger',
  YELLOW: 'warning',
  GREEN: 'success',
};

export default function NearExpiryPage() {
  const qc = useQueryClient();
  const [days, setDays] = useState<number>(30);

  const q = useQuery({
    queryKey: ['near-expiry', days],
    queryFn: () => nearExpiry(days),
  });

  const scrap = useMutation({
    mutationFn: (v: { id: string; delta: number; reason: string }) =>
      adjustBatch(v.id, { delta: v.delta, reason: v.reason }),
    onSuccess: () => {
      Toast.show({ icon: 'success', content: '已报损' });
      qc.invalidateQueries({ queryKey: ['near-expiry'] });
    },
  });

  const onScrap = (b: NearExpiryBatch) => {
    Dialog.confirm({
      title: '报损此批次?',
      content: (
        <div>
          <div>
            <b>{b.productName}</b>
          </div>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 4 }}>
            批次 {b.batchNo} · 到期 {b.expiryDate} · 剩 {b.daysLeft} 天
          </div>
          <div style={{ marginTop: 8 }}>
            将全部 <b>{b.quantity}</b> 件报损。
          </div>
        </div>
      ),
      onConfirm: async () => {
        await scrap.mutateAsync({
          id: b.id,
          delta: -b.quantity,
          reason:
            b.daysLeft < 0
              ? `过期报损:到期 ${b.expiryDate}`
              : `临期报损:到期 ${b.expiryDate}`,
        });
      },
    });
  };

  return (
    <div style={{ padding: 12 }}>
      <Tabs activeKey={String(days)} onChange={(k) => setDays(Number(k))}>
        {DAYS_TABS.map((t) => (
          <Tabs.Tab title={t.label} key={String(t.key)} />
        ))}
      </Tabs>

      <PullToRefresh onRefresh={() => q.refetch().then(() => undefined)}>
        <div style={{ marginTop: 12 }}>
          {q.isError && <ErrorBlock status="default" title="加载失败" />}
          {q.data && q.data.length === 0 && (
            <Empty description="暂无临期/过期批次" />
          )}
          {q.data?.map((b) => (
            <Card
              key={b.id}
              style={{ marginBottom: 10 }}
              title={
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{b.productName}</span>
                  <Tag color={URGENCY_COLOR[b.urgency]}>
                    {b.daysLeft < 0 ? `已过期 ${-b.daysLeft} 天` : `剩 ${b.daysLeft} 天`}
                  </Tag>
                </div>
              }
              extra={
                <span
                  style={{ color: '#ff4d4f', fontSize: 12 }}
                  onClick={() => onScrap(b)}
                >
                  报损
                </span>
              }
            >
              <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                <div>条码 {b.barcode}</div>
                <div>批次 {b.batchNo} · 到期 {b.expiryDate}</div>
                <div>
                  库存 <b style={{ color: '#333' }}>{b.quantity}</b> 件 · 成本 ¥{b.costPrice}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </PullToRefresh>
    </div>
  );
}
