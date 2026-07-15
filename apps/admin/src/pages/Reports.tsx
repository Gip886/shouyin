import { useMemo } from 'react';
import {
  Card,
  Col,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  DailySalesRow,
  RecentOrder,
  dailySales,
  expiryLoss,
  recentOrders,
  stockValue,
} from '../lib/sdk';

/** 极简的横向柱状图，用 CSS 画，不引 chart 库 */
function MiniBar({ value, max }: { value: number; max: number }) {
  const pct = max === 0 ? 0 : Math.max(2, Math.round((value / max) * 100));
  return (
    <div
      style={{
        background: '#e6f4ff',
        height: 8,
        width: '100%',
        borderRadius: 4,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          background: '#1677ff',
          height: '100%',
          width: `${pct}%`,
          transition: 'width .2s',
        }}
      />
    </div>
  );
}

export default function ReportsPage() {
  const { data: sales = [] } = useQuery({
    queryKey: ['reports', 'daily-sales', 14],
    queryFn: () => dailySales(14),
  });
  const { data: stock } = useQuery({
    queryKey: ['reports', 'stock-value'],
    queryFn: stockValue,
  });
  const { data: loss } = useQuery({
    queryKey: ['reports', 'expiry-loss'],
    queryFn: expiryLoss,
  });
  const { data: orders = [], isFetching: ordersFetching } = useQuery({
    queryKey: ['reports', 'recent-orders'],
    queryFn: () => recentOrders(50),
  });

  const totals = useMemo(() => {
    let sum = 0,
      orderCount = 0,
      qty = 0;
    for (const r of sales) {
      sum += Number(r.total);
      orderCount += r.orders;
      qty += r.qty;
    }
    return { sum, orderCount, qty };
  }, [sales]);
  const maxDay = useMemo(
    () => sales.reduce((m, r) => Math.max(m, Number(r.total)), 0),
    [sales],
  );

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Typography.Title level={3} style={{ margin: 0 }}>
        销售报表
      </Typography.Title>

      <Row gutter={16}>
        <Col span={6}>
          <Card>
            <Statistic
              title="14 天营业额"
              value={totals.sum}
              precision={2}
              prefix="¥"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="订单数" value={totals.orderCount} suffix="笔" />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="售出件数" value={totals.qty} suffix="件" />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="库存价值"
              value={stock ? Number(stock.totalValue) : 0}
              precision={2}
              prefix="¥"
            />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              共 {stock?.totalBatches ?? 0} 个批次 · {stock?.totalQty ?? 0} 件
            </Typography.Text>
          </Card>
        </Col>
      </Row>

      {loss && loss.batches > 0 && (
        <Card>
          <Statistic
            title="已过期库存潜在损失"
            value={Number(loss.loss)}
            precision={2}
            prefix="¥"
            valueStyle={{ color: '#cf1322' }}
            suffix={`（${loss.batches} 个批次）`}
          />
        </Card>
      )}

      <Row gutter={16}>
        <Col span={14}>
          <Card title="每日营业额（近 14 天）">
            <Table<DailySalesRow>
              dataSource={sales}
              rowKey="day"
              pagination={false}
              size="small"
              columns={[
                { title: '日期', dataIndex: 'day', width: 120 },
                {
                  title: '',
                  render: (_, r) => (
                    <MiniBar value={Number(r.total)} max={maxDay} />
                  ),
                },
                {
                  title: '营业额',
                  dataIndex: 'total',
                  width: 110,
                  align: 'right',
                  render: (v: string) => `¥${Number(v).toFixed(2)}`,
                },
                {
                  title: '订单',
                  dataIndex: 'orders',
                  width: 70,
                  align: 'right',
                },
                {
                  title: '件数',
                  dataIndex: 'qty',
                  width: 70,
                  align: 'right',
                },
              ]}
            />
          </Card>
        </Col>
        <Col span={10}>
          <Card title="库存价值（按品类）">
            <Table
              dataSource={stock?.byCategory ?? []}
              rowKey="categoryName"
              pagination={false}
              size="small"
              columns={[
                { title: '品类', dataIndex: 'categoryName' },
                {
                  title: '数量',
                  dataIndex: 'qty',
                  width: 90,
                  align: 'right',
                },
                {
                  title: '价值',
                  dataIndex: 'value',
                  width: 120,
                  align: 'right',
                  render: (v: string) => `¥${Number(v).toFixed(2)}`,
                },
              ]}
            />
          </Card>
        </Col>
      </Row>

      <Card title="最近订单">
        <Table<RecentOrder>
          loading={ordersFetching}
          dataSource={orders}
          rowKey="id"
          size="small"
          pagination={{ pageSize: 10 }}
          expandable={{
            expandedRowRender: (o) => (
              <Table
                dataSource={o.items}
                rowKey="id"
                pagination={false}
                size="small"
                columns={[
                  { title: '商品', render: (_, i) => i.product.name },
                  { title: '条码', render: (_, i) => i.product.barcode },
                  { title: '数量', dataIndex: 'qty', width: 80 },
                  {
                    title: '单价',
                    dataIndex: 'unitPrice',
                    width: 100,
                    render: (v: string) => `¥${Number(v).toFixed(2)}`,
                  },
                  {
                    title: '小计',
                    dataIndex: 'subtotal',
                    width: 100,
                    render: (v: string) => `¥${Number(v).toFixed(2)}`,
                  },
                ]}
              />
            ),
          }}
          columns={[
            {
              title: '时间',
              dataIndex: 'createdAt',
              width: 170,
              render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm:ss'),
            },
            {
              title: '订单号',
              dataIndex: 'id',
              render: (v: string) => (
                <Typography.Text style={{ fontSize: 12 }}>
                  {v.slice(0, 12)}…
                </Typography.Text>
              ),
            },
            {
              title: '收银员',
              render: (_, r) => r.cashier?.displayName ?? r.cashier?.username,
              width: 120,
            },
            {
              title: '支付',
              dataIndex: 'paymentMethod',
              width: 90,
              render: (v: string) => {
                const map: Record<string, { label: string; color: string }> = {
                  CASH: { label: '现金', color: 'green' },
                  WECHAT: { label: '微信', color: 'geekblue' },
                  ALIPAY: { label: '支付宝', color: 'blue' },
                };
                const m = map[v] ?? { label: v, color: 'default' };
                return <Tag color={m.color}>{m.label}</Tag>;
              },
            },
            {
              title: '金额',
              dataIndex: 'totalAmount',
              width: 110,
              align: 'right',
              render: (v: string) => (
                <Typography.Text strong>¥{Number(v).toFixed(2)}</Typography.Text>
              ),
            },
          ]}
        />
      </Card>
    </Space>
  );
}
