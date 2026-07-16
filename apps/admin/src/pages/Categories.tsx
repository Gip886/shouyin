import { useState } from 'react';
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Category,
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from '../lib/sdk';

interface FormValues {
  name: string;
  nearExpiryDays: number;
  hasExpiry: boolean;
}

export default function CategoriesPage() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form] = Form.useForm<FormValues>();

  const { data = [], isFetching } = useQuery({
    queryKey: ['categories'],
    queryFn: listCategories,
  });

  const upsertMut = useMutation({
    mutationFn: async (values: FormValues) => {
      // 无保质期分类:nearExpiryDays 存 0(反正不用),避免 required 校验挡住
      const payload = values.hasExpiry
        ? values
        : { ...values, nearExpiryDays: 0 };
      if (editing) return updateCategory(editing.id, payload);
      return createCategory(payload);
    },
    onSuccess: () => {
      message.success(editing ? '已更新' : '已创建');
      setModalOpen(false);
      setEditing(null);
      form.resetFields();
      qc.invalidateQueries({ queryKey: ['categories'] });
    },
  });

  const delMut = useMutation({
    mutationFn: deleteCategory,
    onSuccess: () => {
      message.success('已删除');
      qc.invalidateQueries({ queryKey: ['categories'] });
    },
  });

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ nearExpiryDays: 30, hasExpiry: true });
    setModalOpen(true);
  };
  const openEdit = (c: Category) => {
    setEditing(c);
    form.setFieldsValue({
      name: c.name,
      nearExpiryDays: c.nearExpiryDays,
      hasExpiry: c.hasExpiry,
    });
    setModalOpen(true);
  };

  return (
    <Card
      title="品类管理"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          新增品类
        </Button>
      }
    >
      <Typography.Paragraph type="secondary">
        「临期阈值」决定该品类下商品在扫码时距离过期多少天开始预警,单个商品也能覆盖此阈值。
        文具/日用品这种没保质期的品类,新增时把"管过期"关掉,该品类下所有商品入库都不需填日期。
      </Typography.Paragraph>
      <Table<Category>
        loading={isFetching}
        dataSource={data}
        rowKey="id"
        pagination={false}
        columns={[
          { title: '名称', dataIndex: 'name' },
          {
            title: '管过期',
            dataIndex: 'hasExpiry',
            width: 100,
            render: (v: boolean) =>
              v ? <Tag color="green">是</Tag> : <Tag>否</Tag>,
          },
          {
            title: '临期阈值(天)',
            dataIndex: 'nearExpiryDays',
            width: 140,
            align: 'right',
            render: (v: number, r) => (r.hasExpiry ? v : '—'),
          },
          {
            title: '操作',
            width: 200,
            render: (_, r) => (
              <Space>
                <a onClick={() => openEdit(r)}>编辑</a>
                <Popconfirm
                  title="确认删除该品类？"
                  onConfirm={() => delMut.mutate(r.id)}
                >
                  <a style={{ color: '#cf1322' }}>删除</a>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title={editing ? '编辑品类' : '新增品类'}
        open={modalOpen}
        onOk={() => form.submit()}
        onCancel={() => setModalOpen(false)}
        confirmLoading={upsertMut.isPending}
        destroyOnClose
      >
        <Form<FormValues>
          layout="vertical"
          form={form}
          onFinish={(v) => upsertMut.mutate(v)}
        >
          <Form.Item
            label="名称"
            name="name"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input placeholder="如:饮料 / 文具" />
          </Form.Item>
          <Form.Item
            label="管过期"
            name="hasExpiry"
            valuePropName="checked"
            initialValue={true}
            tooltip="文具、日用品等没保质期的品类关掉。关掉后:该品类下商品入库不需要填日期,收银扫码不判过期,不进临期看板"
          >
            <Switch checkedChildren="管" unCheckedChildren="不管" />
          </Form.Item>
          {/* 关掉管过期时,临期阈值输入自动隐藏 —— 员工不用面对无意义的字段 */}
          <Form.Item
            noStyle
            shouldUpdate={(prev, curr) => prev.hasExpiry !== curr.hasExpiry}
          >
            {({ getFieldValue }) =>
              getFieldValue('hasExpiry') !== false ? (
                <Form.Item
                  label="临期阈值(天)"
                  name="nearExpiryDays"
                  rules={[{ required: true, message: '请输入天数' }]}
                >
                  <InputNumber min={1} max={365} style={{ width: '100%' }} />
                </Form.Item>
              ) : null
            }
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
