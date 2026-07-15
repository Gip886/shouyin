import type { CreateBatchRequest } from '@shouyin/shared';
import { useEffect, useRef, useState } from 'react';
import { Toast } from 'antd-mobile';
import { bulkCreateBatches, listProducts } from './sdk';
import {
  appendHistory,
  countLocalProducts,
  countPendingInbounds,
  countUploadHistory,
  deletePendingInbound,
  listPendingInbounds,
  localProductsSyncedAt,
  updatePendingInbound,
  upsertProducts,
} from './offlineDb';
import { useOnlineStatus } from './useOnlineStatus';

/**
 * 商品全量同步:App 启动或联网时全拉一次。
 * 目前用全量拉,数据小(单店 SKU 常见 <5000);之后加 updatedAfter 增量再优化。
 */
export function useProductSync(online: boolean) {
  const [syncing, setSyncing] = useState(false);
  const [productCount, setProductCount] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);

  const refresh = async () => {
    setProductCount(await countLocalProducts());
    setLastSyncAt(await localProductsSyncedAt());
  };

  const sync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const list = await listProducts();
      await upsertProducts(list);
      await refresh();
      Toast.show({
        content: `已同步 ${list.length} 个商品`,
        icon: 'success',
        duration: 1500,
      });
    } catch (e: any) {
      // 全局 interceptor 已 Toast,这里不重复
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  // 联网时若从未同步或超过 30 分钟,自动拉一次
  const autoTriedRef = useRef(false);
  useEffect(() => {
    if (!online) return;
    if (autoTriedRef.current) return;
    autoTriedRef.current = true;
    (async () => {
      const last = await localProductsSyncedAt();
      const count = await countLocalProducts();
      if (count === 0 || !last || Date.now() - last > 30 * 60 * 1000) {
        sync();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  return { syncing, sync, productCount, lastSyncAt, refresh };
}

/**
 * 待提交入库队列的可观测状态 + replay 触发器。
 * - 联网后 30s 内会自动 replay 一次
 * - 也可手动触发 replay()
 */
export function usePendingInbounds(online: boolean) {
  const [count, setCount] = useState(0);
  const [historyCount, setHistoryCount] = useState(0);
  const [replaying, setReplaying] = useState(false);

  const refresh = async () => {
    setCount(await countPendingInbounds());
    setHistoryCount(await countUploadHistory());
  };

  useEffect(() => {
    refresh();
  }, []);

  const replay = async (): Promise<{ ok: number; failed: number } | null> => {
    if (replaying) return null;
    const pending = await listPendingInbounds();
    if (pending.length === 0) return { ok: 0, failed: 0 };
    setReplaying(true);
    try {
      const items: CreateBatchRequest[] = pending.map((p) => ({
        productId: p.productId,
        productionDate: p.productionDate,
        expiryDate: p.expiryDate,
        quantity: p.quantity,
        costPrice: p.costPrice,
      }));
      const res = await bulkCreateBatches(items);
      // 逐条处理结果:ok 的删本地,失败的 lastError + attempts+1
      // 无论成败都往 upload_history 加一条,供员工事后核对
      const now = Date.now();
      const historyRows = res.results.map((r) => {
        const local = pending[r.index];
        return {
          clientId: local.clientId,
          productName: local.productName,
          productBarcode: local.productBarcode,
          quantity: local.quantity,
          productionDate: local.productionDate,
          expiryDate: local.expiryDate,
          createdAt: local.createdAt,
          uploadedAt: now,
          ok: r.ok,
          batchId: r.batchId,
          batchNo: r.batchNo,
          error: r.error,
        };
      });
      await appendHistory(historyRows);

      let ok = 0;
      let failed = 0;
      for (const r of res.results) {
        const local = pending[r.index];
        if (!local) continue;
        if (r.ok) {
          await deletePendingInbound(local.clientId);
          ok++;
        } else {
          await updatePendingInbound(local.clientId, {
            lastError: r.error,
            attempts: local.attempts + 1,
          });
          failed++;
        }
      }
      await refresh();
      if (ok > 0 && failed === 0) {
        Toast.show({ icon: 'success', content: `已提交 ${ok} 条离线入库` });
      } else if (ok > 0 && failed > 0) {
        Toast.show({ content: `${ok} 成功 / ${failed} 失败,请到待同步页查看` });
      } else if (failed > 0) {
        Toast.show({ icon: 'fail', content: `${failed} 条提交失败` });
      }
      return { ok, failed };
    } catch (e: any) {
      // 请求整体失败(比如网络中途断了),不清本地队列,也不写历史
      Toast.show({ icon: 'fail', content: '提交失败,已保留本地记录' });
      return null;
    } finally {
      setReplaying(false);
    }
  };

  // 联网时自动 replay 一次(delayed 让 online probe 稳定后再触发)
  const autoTriedRef = useRef(false);
  useEffect(() => {
    if (!online) {
      autoTriedRef.current = false;
      return;
    }
    if (autoTriedRef.current) return;
    autoTriedRef.current = true;
    const t = setTimeout(() => {
      countPendingInbounds().then((n) => {
        if (n > 0) replay();
      });
    }, 2000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  return { count, historyCount, replay, replaying, refresh };
}

// 简单聚合:整个 app 只在 Layout 里调一次
export function useOfflineBundle() {
  const { online, lastCheckedAt, recheck } = useOnlineStatus();
  const prodSync = useProductSync(online);
  const pending = usePendingInbounds(online);
  return { online, lastCheckedAt, recheck, prodSync, pending };
}
