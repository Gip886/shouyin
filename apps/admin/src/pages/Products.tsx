import { useState } from 'react';
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Product,
  createProduct,
  deleteProduct,
  listCategories,
  listProducts,
  updateProduct,
} from '../lib/sdk';

interface ProductFormValues {
  barcode: string;
  name: string;
  categoryId: string;
  unit: string;
  salePrice: number;
  costPrice: number;
  nearExpiryDays?: number;
  isActive?: boolean;
}

export default function ProductsPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form] = Form.useForm<ProductFormValues>();

  const { data: cats = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: listCategories,
  });

  const { data = [], isFetching } = useQuery({
    queryKey: ['products', q, categoryId],
    queryFn: () => listProducts({ q: q || undefined, categoryId }),
  });

  const upsertMut = useMutation({
    mutationFn: async (v: ProductFormValues) => {
      const payload = {
        ...v,
        salePrice: v.salePrice.toFixed(2),
        costPrice: v.costPrice.toFixed(2),
      };
      if (editing) {
        // 编辑时不再传 barcode，保持不可变
        const { barcode: _omit, ...rest } = payload;
        return updateProduct(editing.id, rest as unknown as Partial<Product>);
      }
      return createProduct(payload);
    },
    onSuccess: () => {
      message.success(editing ? '已更新' : '已创建');
      setModalOpen(false);
      setEditing(null);
      form.resetFields();
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });

  const delMut = useMutation({
    mutationFn: deleteProduct,
    onSuccess: () => {
      message.success('已下架');
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ unit: '件', isActive: true });
    setModalOpen(true);
  };
  const openEdit = (p: Product) => {
    setEditing(p);
    form.setFieldsValue({
      barcode: p.barcode,
      name: p.name,
      categoryId: p.categoryId,
      unit: p.unit,
      salePrice: Number(p.salePrice),
      costPrice: Number(p.costPrice),
      nearExpiryDays: p.nearExpiryDays ?? undefined,
      isActive: p.isActive,
    });
    setModalOpen(true);
  };

  return (
    <Card
      title="商品管理"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          新增商品
        </Button>
      }
    >
      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="搜索名称或条码"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ width: 260 }}
        />
        <Select
          allowClear
          placeholder="全部品类"
          style={{ width: 160 }}
          value={categoryId}
          onChange={setCategoryId}
          options={cats.map((c) => ({ label: c.name, value: c.id }))}
        />
      </Space>

      <Table<Product>
        loading={isFetching}
        dataSource={data}
        rowKey="id"
        pagination={{ pageSize: 20 }}
        columns={[
          { title: '条码', dataIndex: 'barcode', width: 160 },
          { title: '名称', dataIndex: 'name' },
          {
            title: '品类',
            dataIndex: ['category', 'name'],
            width: 100,
          },
          { title: '单位', dataIndex: 'unit', width: 70 },
          {
            title: '售价',
            dataIndex: 'salePrice',
            width: 100,
            align: 'right',
            render: (v: string) => `¥${Number(v).toFixed(2)}`,
          },
          {
            title: '成本',
            dataIndex: 'costPrice',
            width: 100,
            align: 'right',
            render: (v: string) => `¥${Number(v).toFixed(2)}`,
          },
          {
            title: '状态',
            dataIndex: 'isActive',
            width: 90,
            render: (v: boolean) =>
              v ? <Tag color="green">在售</Tag> : <Tag>已下架</Tag>,
          },
          {
            title: '操作',
            width: 160,
            render: (_, r) => (
              <Space>
                <a onClick={() => openEdit(r)}>编辑</a>
                {r.isActive && (
                  <Popconfirm
                    title="下架此商品？（数据保留）"
                    onConfirm={() => delMut.mutate(r.id)}
                  >
                    <a style={{ color: '#cf1322' }}>下架</a>
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={editing ? '编辑商品' : '新增商品'}
        open={modalOpen}
        onOk={() => form.submit()}
        onCancel={() => setModalOpen(false)}
        confirmLoading={upsertMut.isPending}
        destroyOnClose
        width={560}
      >
        <Form<ProductFormValues>
          layout="vertical"
          form={form}
          onFinish={(v) => upsertMut.mutate(v)}
        >
          <Form.Item
            label="条码"
            name="barcode"
            rules={[{ required: true, message: '请输入条码' }]}
          >
            <Input disabled={!!editing} placeholder="EAN-13 / UPC" />
          </Form.Item>
          <Form.Item
            label="商品名称"
            name="name"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input />
          </Form.Item>
          <Space style={{ display: 'flex' }} align="baseline">
            <Form.Item
              label="品类"
              name="categoryId"
              rules={[{ required: true, message: '请选择品类' }]}
              style={{ flex: 1 }}
            >
              <Select options={cats.map((c) => ({ label: c.name, value: c.id }))} />
            </Form.Item>
            <Form.Item label="单位" name="unit" style={{ width: 100 }}>
              <Input placeholder="件/瓶/包" />
            </Form.Item>
          </Space>
          <Space style={{ display: 'flex' }} align="baseline">
            <Form.Item
              label="售价"
              name="salePrice"
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
            <Form.Item
              label="成本价"
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
          <Form.Item
            label="临期阈值（天，留空则继承品类）"
            name="nearExpiryDays"
          >
            <InputNumber min={1} max={365} style={{ width: '100%' }} />
          </Form.Item>
          {editing && (
            <Form.Item label="是否在售" name="isActive" valuePropName="checked">
              <Switch />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </Card>
  );
}
