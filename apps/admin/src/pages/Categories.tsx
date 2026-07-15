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
  Table,
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

export default function CategoriesPage() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form] = Form.useForm<{ name: string; nearExpiryDays: number }>();

  const { data = [], isFetching } = useQuery({
    queryKey: ['categories'],
    queryFn: listCategories,
  });

  const upsertMut = useMutation({
    mutationFn: async (values: { name: string; nearExpiryDays: number }) => {
      if (editing) return updateCategory(editing.id, values);
      return createCategory(values);
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
    form.setFieldsValue({ nearExpiryDays: 30 });
    setModalOpen(true);
  };
  const openEdit = (c: Category) => {
    setEditing(c);
    form.setFieldsValue({ name: c.name, nearExpiryDays: c.nearExpiryDays });
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
        品类的「临期阈值」决定该品类下商品在扫码时距离过期多少天开始预警。单个商品也可以覆盖此阈值。
      </Typography.Paragraph>
      <Table<Category>
        loading={isFetching}
        dataSource={data}
        rowKey="id"
        pagination={false}
        columns={[
          { title: '名称', dataIndex: 'name' },
          {
            title: '临期阈值（天）',
            dataIndex: 'nearExpiryDays',
            width: 160,
            align: 'right',
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
        <Form
          layout="vertical"
          form={form}
          onFinish={(v) => upsertMut.mutate(v)}
        >
          <Form.Item
            label="名称"
            name="name"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input placeholder="如：饮料" />
          </Form.Item>
          <Form.Item
            label="临期阈值（天）"
            name="nearExpiryDays"
            rules={[{ required: true, message: '请输入天数' }]}
          >
            <InputNumber min={1} max={365} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
