import { useMemo, useState } from 'react';
import {
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { PlusOutlined, ToolOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Batch,
  adjustBatch,
  createBatch,
  listBatches,
  listProducts,
} from '../lib/sdk';

interface ReceiveFormValues {
  productId: string;
  batchNo?: string;
  productionDate?: Dayjs;
  shelfLifeDays?: number;
  quantity: number;
  costPrice: number;
}

interface AdjustFormValues {
  delta: number;
  reason: string;
}

function statusTag(s: Batch['status']) {
  if (s === 'ACTIVE') return <Tag color="green">在售</Tag>;
  if (s === 'DEPLETED') return <Tag>已售完</Tag>;
  return <Tag color="volcano">已过期下架</Tag>;
}

function daysLeftOf(expiry: string): number {
  return dayjs(expiry).startOf('day').diff(dayjs().startOf('day'), 'day');
}

export default function BatchesPage() {
  const qc = useQueryClient();
  const [productFilter, setProductFilter] = useState<string | undefined>();

  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiveForm] = Form.useForm<ReceiveFormValues>();

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState<Batch | null>(null);
  const [adjustForm] = Form.useForm<AdjustFormValues>();

  const { data: products = [] } = useQuery({
    queryKey: ['products', 'all'],
    queryFn: () => listProducts({}),
  });

  const { data: batches = [], isFetching } = useQuery({
    queryKey: ['batches', productFilter],
    queryFn: () => listBatches(productFilter),
  });

  const receiveMut = useMutation({
    mutationFn: async (v: ReceiveFormValues) => {
      const chosen = products.find((p) => p.id === v.productId);
      const hasExpiry = chosen?.category?.hasExpiry ?? true;
      let production: string | undefined;
      let expiry: string | undefined;
      if (hasExpiry) {
        if (!v.productionDate || !v.shelfLifeDays) {
          throw new Error('请填写生产日期和保质期');
        }
        production = v.productionDate.format('YYYY-MM-DD');
        expiry = v.productionDate
          .add(v.shelfLifeDays, 'day')
          .format('YYYY-MM-DD');
      }
      return createBatch({
        productId: v.productId,
        batchNo: v.batchNo,
        productionDate: production,
        expiryDate: expiry,
        quantity: v.quantity,
        costPrice: v.costPrice.toFixed(2),
      });
    },
    onSuccess: () => {
      message.success('入库成功');
      setReceiveOpen(false);
      receiveForm.resetFields();
      qc.invalidateQueries({ queryKey: ['batches'] });
      qc.invalidateQueries({ queryKey: ['near-expiry'] });
    },
  });

  const adjustMut = useMutation({
    mutationFn: async (v: AdjustFormValues) => {
      if (!adjustTarget) throw new Error('无目标批次');
      return adjustBatch(adjustTarget.id, { delta: v.delta, reason: v.reason });
    },
    onSuccess: () => {
      message.success('调整成功');
      setAdjustOpen(false);
      setAdjustTarget(null);
      adjustForm.resetFields();
      qc.invalidateQueries({ queryKey: ['batches'] });
      qc.invalidateQueries({ queryKey: ['near-expiry'] });
    },
  });

  const openReceive = () => {
    receiveForm.resetFields();
    receiveForm.setFieldsValue({
      productionDate: dayjs(),
      shelfLifeDays: 180,
    });
    setReceiveOpen(true);
  };

  const openAdjust = (b: Batch) => {
    setAdjustTarget(b);
    adjustForm.resetFields();
    setAdjustOpen(true);
  };

  const expiryPreview = useMemo(() => {
    return () => {
      const v = receiveForm.getFieldsValue();
      if (v.productionDate && v.shelfLifeDays) {
        return v.productionDate.add(v.shelfLifeDays, 'day').format('YYYY-MM-DD');
      }
      return '—';
    };
  }, [receiveForm]);

  return (
    <Card
      title="批次与库存"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={openReceive}>
          入库新批次
        </Button>
      }
    >
      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          allowClear
          showSearch
          filterOption={(input, option) =>
            String(option?.label ?? '')
              .toLowerCase()
              .includes(input.toLowerCase())
          }
          placeholder="按商品筛选"
          style={{ width: 280 }}
          value={productFilter}
          onChange={setProductFilter}
          options={products.map((p) => ({
            label: `${p.name} (${p.barcode})`,
            value: p.id,
          }))}
        />
      </Space>

      <Table<Batch>
        loading={isFetching}
        dataSource={batches}
        rowKey="id"
        pagination={{ pageSize: 20 }}
        columns={[
          {
            title: '商品',
            width: 200,
            render: (_, r) => (
              <div>
                <div>{r.product?.name ?? '—'}</div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {r.product?.barcode}
                </Typography.Text>
              </div>
            ),
          },
          { title: '批次号', dataIndex: 'batchNo', width: 160 },
          {
            title: '生产日期',
            dataIndex: 'productionDate',
            width: 120,
            render: (v: string | null) => v?.slice(0, 10) ?? '—',
          },
          {
            title: '到期日',
            dataIndex: 'expiryDate',
            width: 120,
            render: (v: string | null) => v?.slice(0, 10) ?? '无保质期',
          },
          {
            title: '剩余天数',
            width: 110,
            render: (_, r) => {
              if (!r.expiryDate) return <Tag>—</Tag>;
              const d = daysLeftOf(r.expiryDate);
              if (d < 0) return <Tag color="volcano">过期 {-d} 天</Tag>;
              if (d < 7) return <Tag color="red">{d} 天</Tag>;
              if (d <= 30) return <Tag color="gold">{d} 天</Tag>;
              return <Tag color="green">{d} 天</Tag>;
            },
          },
          { title: '数量', dataIndex: 'quantity', width: 90, align: 'right' },
          {
            title: '初始',
            dataIndex: 'initialQty',
            width: 80,
            align: 'right',
          },
          {
            title: '状态',
            dataIndex: 'status',
            width: 120,
            render: (s: Batch['status']) => statusTag(s),
          },
          {
            title: '操作',
            width: 120,
            render: (_, r) => (
              <Button
                size="small"
                icon={<ToolOutlined />}
                onClick={() => openAdjust(r)}
              >
                调整
              </Button>
            ),
          },
        ]}
      />

      <Modal
        title="入库新批次"
        open={receiveOpen}
        onOk={() => receiveForm.submit()}
        onCancel={() => setReceiveOpen(false)}
        confirmLoading={receiveMut.isPending}
        destroyOnClose
        width={520}
      >
        <Form<ReceiveFormValues>
          layout="vertical"
          form={receiveForm}
          onFinish={(v) => receiveMut.mutate(v)}
        >
          <Form.Item
            label="商品"
            name="productId"
            rules={[{ required: true, message: '请选择商品' }]}
          >
            <Select
              showSearch
              placeholder="按名称或条码搜索"
              filterOption={(input, option) =>
                String(option?.label ?? '')
                  .toLowerCase()
                  .includes(input.toLowerCase())
              }
              options={products.map((p) => ({
                label: `${p.name} (${p.barcode})${p.category?.hasExpiry === false ? ' · 无保质期' : ''}`,
                value: p.id,
              }))}
            />
          </Form.Item>
          {/* 生产日期/保质期两块,只在选中的商品所属分类"管过期"时才显示 */}
          <Form.Item
            noStyle
            shouldUpdate={(prev, next) => prev.productId !== next.productId}
          >
            {({ getFieldValue }) => {
              const pid = getFieldValue('productId');
              const chosen = products.find((p) => p.id === pid);
              // 未选商品:默认按"管过期"展示,一旦选定切换到实际值
              const hasExpiry = chosen ? chosen.category?.hasExpiry !== false : true;
              if (!hasExpiry) {
                return (
                  <Typography.Paragraph
                    type="secondary"
                    style={{
                      background: '#f5f5f5',
                      padding: '8px 12px',
                      borderRadius: 6,
                      marginBottom: 12,
                    }}
                  >
                    该分类"{chosen?.category?.name}"不管过期,入库无需填写生产日期和保质期。
                  </Typography.Paragraph>
                );
              }
              return (
                <>
                  <Space style={{ display: 'flex' }} align="baseline">
                    <Form.Item
                      label="生产日期"
                      name="productionDate"
                      rules={[{ required: true, message: '必填' }]}
                      style={{ flex: 1 }}
                    >
                      <DatePicker style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item
                      label="保质期(天)"
                      name="shelfLifeDays"
                      rules={[{ required: true, message: '必填' }]}
                      style={{ width: 160 }}
                    >
                      <InputNumber
                        min={1}
                        max={3650}
                        style={{ width: '100%' }}
                      />
                    </Form.Item>
                  </Space>
                  <Typography.Paragraph type="secondary" style={{ marginTop: -8 }}>
                    到期日预览:
                    <Typography.Text strong>
                      <Form.Item
                        shouldUpdate={(prev, next) =>
                          prev.productionDate !== next.productionDate ||
                          prev.shelfLifeDays !== next.shelfLifeDays
                        }
                        noStyle
                      >
                        {() => expiryPreview()}
                      </Form.Item>
                    </Typography.Text>
                  </Typography.Paragraph>
                </>
              );
            }}
          </Form.Item>
          <Space style={{ display: 'flex' }} align="baseline">
            <Form.Item
              label="数量"
              name="quantity"
              rules={[{ required: true, message: '必填' }]}
              style={{ flex: 1 }}
            >
              <InputNumber min={1} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              label="进货成本（单价）"
              name="costPrice"
              rules={[{ required: true, message: '必填' }]}
              style={{ flex: 1 }}
            >
              <InputNumber
                min={0}
                step={0.1}
                precision={2}
                prefix="¥"
                style={{ width: '100%' }}
              />
            </Form.Item>
          </Space>
          <Form.Item label="批次号（留空自动生成）" name="batchNo">
            <Input placeholder="YYYYMMDD-XXX" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={
          adjustTarget
            ? `调整批次 · ${adjustTarget.product?.name ?? ''} / ${adjustTarget.batchNo}`
            : '调整'
        }
        open={adjustOpen}
        onOk={() => adjustForm.submit()}
        onCancel={() => setAdjustOpen(false)}
        confirmLoading={adjustMut.isPending}
        destroyOnClose
      >
        {adjustTarget && (
          <Typography.Paragraph type="secondary">
            当前剩余数量：<strong>{adjustTarget.quantity}</strong>。正数为盘盈或补录，负数为报损/出库。
          </Typography.Paragraph>
        )}
        <Form<AdjustFormValues>
          layout="vertical"
          form={adjustForm}
          onFinish={(v) => adjustMut.mutate(v)}
        >
          <Form.Item
            label="变动数量（±）"
            name="delta"
            rules={[{ required: true, message: '必填' }]}
          >
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            label="原因"
            name="reason"
            rules={[{ required: true, message: '请写明原因' }]}
          >
            <Input placeholder="如：盘点核对、破损报损、过期下架" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
