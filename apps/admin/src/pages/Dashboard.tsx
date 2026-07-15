import { useMemo } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { ReloadOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { nearExpiry, runDailyScan } from '../lib/sdk';
import type { NearExpiryBatch } from '@shouyin/shared';

function urgencyTag(u: NearExpiryBatch['urgency'], daysLeft: number) {
  if (daysLeft < 0) return <Tag color="volcano">已过期 {-daysLeft} 天</Tag>;
  const map = {
    RED: { color: 'red', label: `${daysLeft} 天` },
    YELLOW: { color: 'gold', label: `${daysLeft} 天` },
    GREEN: { color: 'green', label: `${daysLeft} 天` },
  } as const;
  const m = map[u];
  return <Tag color={m.color}>{m.label}</Tag>;
}

export default function DashboardPage() {
  const qc = useQueryClient();

  const { data = [], isFetching, refetch } = useQuery({
    queryKey: ['near-expiry', 60],
    queryFn: () => nearExpiry(60),
  });

  const scanMut = useMutation({
    mutationFn: runDailyScan,
    onSuccess: (r) => {
      message.success(
        `扫描完成：过期 ${r.expired} 个批次，7 天内到期 ${r.nearExpiry} 个`,
      );
      qc.invalidateQueries({ queryKey: ['near-expiry'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const stats = useMemo(() => {
    let red = 0,
      yellow = 0,
      expired = 0,
      lossValue = 0;
    for (const b of data) {
      if (b.daysLeft < 0) {
        expired++;
        lossValue += Number(b.costPrice) * b.quantity;
      } else if (b.urgency === 'RED') red++;
      else if (b.urgency === 'YELLOW') yellow++;
    }
    return { red, yellow, expired, lossValue };
  }, [data]);

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Row justify="space-between" align="middle">
        <Typography.Title level={3} style={{ margin: 0 }}>
          临期看板
        </Typography.Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isFetching}>
            刷新
          </Button>
          <Button
            type="primary"
            icon={<ThunderboltOutlined />}
            onClick={() => scanMut.mutate()}
            loading={scanMut.isPending}
          >
            手动触发每日扫描
          </Button>
        </Space>
      </Row>

      {stats.expired > 0 && (
        <Alert
          type="error"
          showIcon
          message={`当前有 ${stats.expired} 个已过期批次仍在系统中，请立刻处理`}
          description="过期批次会阻止收银端结账。请到「批次与库存」页面报损清理。"
        />
      )}

      <Row gutter={16}>
        <Col span={6}>
          <Card>
            <Statistic
              title="已过期批次"
              value={stats.expired}
              valueStyle={{ color: '#cf1322' }}
              suffix="个"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="7 天内到期"
              value={stats.red}
              valueStyle={{ color: '#d4380d' }}
              suffix="个"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="7-30 天到期"
              value={stats.yellow}
              valueStyle={{ color: '#d48806' }}
              suffix="个"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="预估过期损失"
              value={stats.lossValue}
              precision={2}
              prefix="¥"
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title="60 天内到期批次（按到期时间升序）"
        extra={<Typography.Text type="secondary">共 {data.length} 条</Typography.Text>}
      >
        <Table<NearExpiryBatch>
          dataSource={data}
          rowKey="id"
          size="middle"
          pagination={{ pageSize: 20 }}
          columns={[
            {
              title: '紧迫度',
              dataIndex: 'urgency',
              width: 110,
              render: (_, r) => urgencyTag(r.urgency, r.daysLeft),
              filters: [
                { text: '已过期', value: 'EXPIRED' },
                { text: '红（<7天）', value: 'RED' },
                { text: '黄（7-30天）', value: 'YELLOW' },
                { text: '绿（>30天）', value: 'GREEN' },
              ],
              onFilter: (v, r) =>
                v === 'EXPIRED' ? r.daysLeft < 0 : r.urgency === v,
            },
            { title: '商品名', dataIndex: 'productName' },
            { title: '条码', dataIndex: 'barcode', width: 150 },
            { title: '批次号', dataIndex: 'batchNo', width: 160 },
            { title: '生产日期', dataIndex: 'productionDate', width: 120 },
            { title: '到期日', dataIndex: 'expiryDate', width: 120 },
            {
              title: '剩余数量',
              dataIndex: 'quantity',
              width: 100,
              align: 'right',
            },
            {
              title: '成本价',
              dataIndex: 'costPrice',
              width: 100,
              align: 'right',
              render: (v: string) => `¥${Number(v).toFixed(2)}`,
            },
          ]}
        />
      </Card>
    </Space>
  );
}
