import {
  Button,
  Card,
  CenterPopup,
  Dialog,
  DotLoading,
  Empty,
  List,
  PullToRefresh,
  Space,
  SwipeAction,
  Tabs,
  Tag,
  Toast,
} from 'antd-mobile';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  clearPendingInbounds,
  clearUploadHistory,
  deleteHistoryEntry,
  deletePendingInbound,
  listPendingInbounds,
  listUploadHistory,
  type PendingInbound,
  type UploadHistoryEntry,
} from '../lib/offlineDb';
import { getBatch } from '../lib/sdk';
import { useOffline } from '../lib/OfflineContext';

export default function PendingPage() {
  const { online, prodSync, pending } = useOffline();
  const [tab, setTab] = useState<'queue' | 'history'>('queue');
  const [items, setItems] = useState<PendingInbound[]>([]);
  const [history, setHistory] = useState<UploadHistoryEntry[]>([]);
  const [verifyEntry, setVerifyEntry] = useState<UploadHistoryEntry | null>(null);

  // 深度确认:点击历史项后向后端查真实批次数据
  const verifyQuery = useQuery({
    queryKey: ['batch', verifyEntry?.batchId],
    queryFn: () => getBatch(verifyEntry!.batchId!),
    enabled: !!verifyEntry?.batchId && online,
    staleTime: 0,
    retry: 0,
  });

  const refresh = async () => {
    setItems(await listPendingInbounds());
    setHistory(await listUploadHistory(100));
    await pending.refresh();
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending.count, pending.historyCount]);

  const onReplayAll = async () => {
    if (!online) {
      Toast.show({ content: '当前离线,联网后再试' });
      return;
    }
    const r = await pending.replay();
    if (r) {
      await refresh();
      // 提交完切到历史 Tab,让员工看到"传上去了没"
      if (r.ok > 0 || r.failed > 0) setTab('history');
    }
  };

  const onDelete = (p: PendingInbound) => {
    Dialog.confirm({
      title: '删除这条待提交入库?',
      content: `${p.productName} × ${p.quantity}${p.expiryDate ? `,到期 ${p.expiryDate}` : ''}`,
      onConfirm: async () => {
        await deletePendingInbound(p.clientId);
        await refresh();
        Toast.show({ content: '已删除' });
      },
    });
  };

  const onClearAll = () => {
    Dialog.confirm({
      title: '清空所有待提交入库?',
      content: '本地队列会被全部丢弃,无法恢复。',
      onConfirm: async () => {
        await clearPendingInbounds();
        await refresh();
        Toast.show({ content: '已清空' });
      },
    });
  };

  const onClearHistory = () => {
    Dialog.confirm({
      title: '清空上传历史?',
      content: '仅删除本地记录,不影响已上传到服务器的数据。',
      onConfirm: async () => {
        await clearUploadHistory();
        await refresh();
      },
    });
  };

  return (
    <div style={{ padding: 12 }}>
      <Card title="商品数据">
        <Space direction="vertical" block>
          <div style={{ fontSize: 13 }}>
            本地缓存 <b>{prodSync.productCount}</b> 个商品
            {prodSync.lastSyncAt && (
              <span style={{ color: '#8c8c8c', marginLeft: 6, fontSize: 12 }}>
                · 上次同步 {dayjs(prodSync.lastSyncAt).format('MM-DD HH:mm')}
              </span>
            )}
          </div>
          <Button
            block
            color="primary"
            fill="outline"
            size="small"
            disabled={!online || prodSync.syncing}
            loading={prodSync.syncing}
            onClick={prodSync.sync}
          >
            {online ? '立即同步商品' : '离线,无法同步'}
          </Button>
        </Space>
      </Card>

      <div style={{ marginTop: 12, background: '#fff', borderRadius: 8 }}>
        <Tabs activeKey={tab} onChange={(k) => setTab(k as any)}>
          <Tabs.Tab title={`待提交 (${items.length})`} key="queue" />
          <Tabs.Tab title={`上传历史 (${history.length})`} key="history" />
        </Tabs>
      </div>

      {tab === 'queue' ? (
        <>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <Button
              block
              color="primary"
              size="middle"
              disabled={!online || items.length === 0 || pending.replaying}
              loading={pending.replaying}
              onClick={onReplayAll}
            >
              {!online
                ? '离线,联网后再提交'
                : items.length === 0
                  ? '暂无待提交'
                  : `提交全部(${items.length})`}
            </Button>
            {items.length > 0 && (
              <Button color="danger" fill="outline" size="middle" onClick={onClearAll}>
                清空
              </Button>
            )}
          </div>

          <PullToRefresh onRefresh={async () => refresh()}>
            <div style={{ marginTop: 12 }}>
              {items.length === 0 ? (
                <Empty description="队列为空" style={{ padding: 32 }} />
              ) : (
                <List>
                  {items.map((p) => (
                    <SwipeAction
                      key={p.clientId}
                      rightActions={[
                        {
                          key: 'delete',
                          text: '删除',
                          color: 'danger',
                          onClick: () => onDelete(p),
                        },
                      ]}
                    >
                      <List.Item
                        title={
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span>{p.productName}</span>
                            {p.lastError && <Tag color="danger">上次失败</Tag>}
                          </div>
                        }
                        description={
                          <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                            <div>
                              条码 {p.productBarcode} · {p.quantity} 件 · ¥
                              {p.costPrice}
                            </div>
                            <div>
                              {p.expiryDate
                                ? `生产 ${p.productionDate ?? '—'} → 到期 ${p.expiryDate}`
                                : '无保质期'}
                            </div>
                            <div>
                              创建 {dayjs(p.createdAt).format('MM-DD HH:mm')}
                              {p.attempts > 0 && (
                                <span style={{ marginLeft: 6 }}>
                                  · 已重试 {p.attempts} 次
                                </span>
                              )}
                            </div>
                            {p.lastError && (
                              <div style={{ color: '#ff4d4f', marginTop: 4 }}>
                                {p.lastError}
                              </div>
                            )}
                          </div>
                        }
                      />
                    </SwipeAction>
                  ))}
                </List>
              )}
            </div>
          </PullToRefresh>
        </>
      ) : (
        <>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            {history.length > 0 && (
              <Button
                block
                color="default"
                fill="outline"
                size="middle"
                onClick={onClearHistory}
              >
                清空历史记录
              </Button>
            )}
          </div>

          <PullToRefresh onRefresh={async () => refresh()}>
            <div style={{ marginTop: 12 }}>
              {history.length === 0 ? (
                <Empty
                  description="暂无上传记录"
                  style={{ padding: 32 }}
                />
              ) : (
                <List>
                  {history.map((h) => (
                    <SwipeAction
                      key={h.id}
                      rightActions={[
                        {
                          key: 'delete',
                          text: '删除',
                          color: 'default',
                          onClick: async () => {
                            if (h.id != null) {
                              await deleteHistoryEntry(h.id);
                              await refresh();
                            }
                          },
                        },
                      ]}
                    >
                      <List.Item
                        clickable={h.ok && !!h.batchId}
                        arrow={h.ok && !!h.batchId}
                        onClick={
                          h.ok && h.batchId
                            ? () => setVerifyEntry(h)
                            : undefined
                        }
                        prefix={
                          <div
                            style={{
                              width: 8,
                              alignSelf: 'stretch',
                              background: h.ok ? '#52c41a' : '#ff4d4f',
                              borderRadius: 2,
                              marginRight: 4,
                            }}
                          />
                        }
                        title={
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span>{h.productName}</span>
                            {h.ok ? (
                              <Tag color="success">已上传</Tag>
                            ) : (
                              <Tag color="danger">失败</Tag>
                            )}
                          </div>
                        }
                        description={
                          <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                            <div>
                              条码 {h.productBarcode} · {h.quantity} 件
                              {h.expiryDate ? ` · 到期 ${h.expiryDate}` : ''}
                            </div>
                            <div>
                              上传于 {dayjs(h.uploadedAt).format('MM-DD HH:mm:ss')}
                              <span style={{ marginLeft: 6, color: '#bfbfbf' }}>
                                (扫码于 {dayjs(h.createdAt).format('MM-DD HH:mm')})
                              </span>
                            </div>
                            {h.ok && h.batchNo && (
                              <div style={{ color: '#389e0d', marginTop: 4 }}>
                                批次号 {h.batchNo}
                                {h.batchId && (
                                  <span style={{ color: '#bfbfbf', marginLeft: 6 }}>
                                    · 点击核对 →
                                  </span>
                                )}
                              </div>
                            )}
                            {!h.ok && h.error && (
                              <div style={{ color: '#ff4d4f', marginTop: 4 }}>
                                {h.error}
                              </div>
                            )}
                          </div>
                        }
                      />
                    </SwipeAction>
                  ))}
                </List>
              )}
            </div>
          </PullToRefresh>
        </>
      )}

      {/* 深度确认弹窗:查后端批次实况 */}
      <CenterPopup
        visible={!!verifyEntry}
        onMaskClick={() => setVerifyEntry(null)}
        onClose={() => setVerifyEntry(null)}
        closeOnMaskClick
        style={{
          '--min-width': '86vw',
          '--max-width': '86vw',
        }}
      >
        <div style={{ padding: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
            后端核对
          </div>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 12 }}>
            从服务器查询当前批次的实况,确认已成功入库。
          </div>

          {!online && (
            <div
              style={{
                background: '#fff7e6',
                border: '1px solid #ffd591',
                color: '#874d00',
                borderRadius: 6,
                padding: 8,
                fontSize: 12,
                marginBottom: 12,
              }}
            >
              当前离线,无法核对。请联网后再打开此项。
            </div>
          )}

          {online && verifyQuery.isLoading && (
            <div
              style={{
                textAlign: 'center',
                padding: 20,
                color: '#8c8c8c',
              }}
            >
              <DotLoading color="primary" /> 查询中…
            </div>
          )}

          {online && verifyQuery.isError && (
            <div
              style={{
                background: '#fff1f0',
                border: '1px solid #ffa39e',
                color: '#a8071a',
                borderRadius: 6,
                padding: 10,
                fontSize: 13,
              }}
            >
              查询失败:该批次在服务器上可能已被删除或调整。
              <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 4 }}>
                {(verifyQuery.error as any)?.response?.data?.message ??
                  (verifyQuery.error as any)?.message ??
                  '未知错误'}
              </div>
            </div>
          )}

          {online && verifyQuery.data && verifyEntry && (
            <div style={{ fontSize: 13 }}>
              <div
                style={{
                  background: '#f6ffed',
                  border: '1px solid #b7eb8f',
                  color: '#237804',
                  borderRadius: 6,
                  padding: '8px 10px',
                  marginBottom: 10,
                  fontSize: 12,
                }}
              >
                ✅ 服务器已确认此批次
              </div>
              <div style={{ marginBottom: 4 }}>
                <b>{verifyQuery.data.product?.name ?? verifyEntry.productName}</b>
              </div>
              <div style={{ fontSize: 12, color: '#8c8c8c', lineHeight: 1.8 }}>
                <div>
                  批次号 <b style={{ color: '#333' }}>{verifyQuery.data.batchNo}</b>
                </div>
                <div>
                  条码 {verifyEntry.productBarcode}
                </div>
                <div>
                  生产 {verifyQuery.data.productionDate?.slice(0, 10)} → 到期{' '}
                  {verifyQuery.data.expiryDate?.slice(0, 10)}
                </div>
                <div>
                  入库时 <b>{verifyQuery.data.initialQty}</b> 件 · 当前剩余{' '}
                  <b style={{ color: '#333' }}>{verifyQuery.data.quantity}</b> 件
                  {verifyQuery.data.quantity < verifyQuery.data.initialQty && (
                    <span style={{ color: '#faad14', marginLeft: 4 }}>
                      (已消耗{' '}
                      {verifyQuery.data.initialQty - verifyQuery.data.quantity})
                    </span>
                  )}
                </div>
                <div>
                  成本 ¥{verifyQuery.data.costPrice} · 状态{' '}
                  <Tag
                    color={
                      verifyQuery.data.status === 'ACTIVE'
                        ? 'success'
                        : verifyQuery.data.status === 'DEPLETED'
                          ? 'default'
                          : 'danger'
                    }
                  >
                    {verifyQuery.data.status === 'ACTIVE'
                      ? '在售'
                      : verifyQuery.data.status === 'DEPLETED'
                        ? '已售罄'
                        : '过期下架'}
                  </Tag>
                </div>
                <div style={{ marginTop: 6, color: '#bfbfbf' }}>
                  服务器记录入库时间 {dayjs(verifyQuery.data.receivedAt).format('MM-DD HH:mm:ss')}
                </div>
              </div>
            </div>
          )}

          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            {online && (
              <Button
                block
                fill="outline"
                onClick={() => {
                  verifyQuery.refetch();
                }}
                loading={verifyQuery.isFetching}
              >
                重新查询
              </Button>
            )}
            <Button
              block
              color="primary"
              onClick={() => setVerifyEntry(null)}
            >
              关闭
            </Button>
          </div>
        </div>
      </CenterPopup>
    </div>
  );
}
