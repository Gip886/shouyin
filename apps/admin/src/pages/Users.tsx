import { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
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
import { KeyOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  User,
  UserRole,
  createUser,
  listUsers,
  resetUserPassword,
  updateUser,
} from '../lib/sdk';
import { getCurrentUser } from '../lib/api';

const ROLE_OPTIONS: { value: UserRole; label: string; color: string }[] = [
  { value: 'ADMIN', label: '管理员', color: 'red' },
  { value: 'CASHIER', label: '收银员', color: 'blue' },
  { value: 'STOCKER', label: '仓管', color: 'green' },
];

interface UpsertValues {
  username?: string;
  displayName: string;
  password?: string;
  role: UserRole;
  isActive: boolean;
}

/**
 * 账号管理页 —— 只有 ADMIN 能看到入口(菜单侧栏根据 role 过滤)。
 * 后端 controller 也标了 @Roles('ADMIN'),前端小学生绕过菜单直接输 URL 也进不来。
 *
 * 功能:
 *   - 建号 / 改显示名+角色+启停 / 重置密码
 *   - 不做真删(会破坏历史订单外键),用"禁用"代替
 *   - 自我保护:不能改自己的角色为非 ADMIN,不能禁用自己(后端也拦一遍)
 */
export default function UsersPage() {
  const qc = useQueryClient();
  const me = getCurrentUser();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [pwdTarget, setPwdTarget] = useState<User | null>(null);
  const [form] = Form.useForm<UpsertValues>();
  const [pwdForm] = Form.useForm<{ password: string }>();

  const { data = [], isFetching } = useQuery({
    queryKey: ['users'],
    queryFn: listUsers,
  });

  const upsertMut = useMutation({
    mutationFn: async (v: UpsertValues) => {
      if (editing) {
        // 编辑不改用户名 / 密码 —— 密码走单独的"重置"按钮流程,更清晰
        return updateUser(editing.id, {
          displayName: v.displayName,
          role: v.role,
          isActive: v.isActive,
        });
      }
      return createUser({
        username: v.username!.trim(),
        displayName: v.displayName.trim(),
        password: v.password!,
        role: v.role,
      });
    },
    onSuccess: () => {
      message.success(editing ? '已更新' : '账号已创建');
      setModalOpen(false);
      setEditing(null);
      form.resetFields();
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: any) => {
      const raw = err?.response?.data?.message;
      const msg = Array.isArray(raw) ? raw.join('；') : raw ?? err?.message;
      message.error(msg || '保存失败');
    },
  });

  const resetPwdMut = useMutation({
    mutationFn: (v: { id: string; password: string }) =>
      resetUserPassword(v.id, v.password),
    onSuccess: () => {
      message.success('密码已重置,请把新密码发给员工');
      setPwdTarget(null);
      pwdForm.resetFields();
    },
    onError: (err: any) => {
      const raw = err?.response?.data?.message;
      const msg = Array.isArray(raw) ? raw.join('；') : raw ?? err?.message;
      message.error(msg || '重置失败');
    },
  });

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ role: 'CASHIER', isActive: true });
    setModalOpen(true);
  };
  const openEdit = (u: User) => {
    setEditing(u);
    form.setFieldsValue({
      displayName: u.displayName,
      role: u.role,
      isActive: u.isActive,
    });
    setModalOpen(true);
  };

  return (
    <Card
      title="账号管理"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          新增账号
        </Button>
      }
    >
      <Typography.Paragraph type="secondary">
        新员工入职建号,给一个初始密码让他登进来后自己改。老员工忘密码,用"重置密码"发一个临时密码给他。
        离职的账号点"禁用"(不能删,会破坏历史订单里的操作人记录)。
      </Typography.Paragraph>

      <Table<User>
        loading={isFetching}
        dataSource={data}
        rowKey="id"
        pagination={false}
        columns={[
          { title: '用户名', dataIndex: 'username', width: 160 },
          { title: '显示名', dataIndex: 'displayName' },
          {
            title: '角色',
            dataIndex: 'role',
            width: 120,
            render: (r: UserRole) => {
              const opt = ROLE_OPTIONS.find((o) => o.value === r);
              return <Tag color={opt?.color}>{opt?.label ?? r}</Tag>;
            },
          },
          {
            title: '状态',
            dataIndex: 'isActive',
            width: 100,
            render: (v: boolean) =>
              v ? <Tag color="green">在用</Tag> : <Tag>已禁用</Tag>,
          },
          {
            title: '操作',
            width: 260,
            render: (_, r) => (
              <Space>
                <a onClick={() => openEdit(r)}>编辑</a>
                <a onClick={() => setPwdTarget(r)}>
                  <KeyOutlined /> 重置密码
                </a>
                {r.isActive ? (
                  <Popconfirm
                    title={`确认禁用「${r.displayName}」?`}
                    description="禁用后此账号将无法登录,历史记录仍然保留。"
                    onConfirm={() =>
                      upsertMut.mutate({
                        displayName: r.displayName,
                        role: r.role,
                        isActive: false,
                      } as UpsertValues)
                    }
                    disabled={me?.id === r.id}
                  >
                    <a
                      style={{
                        color: me?.id === r.id ? '#bfbfbf' : '#cf1322',
                        cursor: me?.id === r.id ? 'not-allowed' : 'pointer',
                      }}
                    >
                      禁用
                    </a>
                  </Popconfirm>
                ) : (
                  <a
                    onClick={() =>
                      // 复用 upsertMut 但直接改 isActive;需要临时 setEditing
                      updateUser(r.id, { isActive: true })
                        .then(() => {
                          message.success('已启用');
                          qc.invalidateQueries({ queryKey: ['users'] });
                        })
                        .catch((e) => message.error(e.message ?? '启用失败'))
                    }
                  >
                    启用
                  </a>
                )}
              </Space>
            ),
          },
        ]}
      />

      {/* 新增 / 编辑 */}
      <Modal
        title={editing ? `编辑账号 · ${editing.username}` : '新增账号'}
        open={modalOpen}
        onOk={() => form.submit()}
        onCancel={() => setModalOpen(false)}
        confirmLoading={upsertMut.isPending}
        destroyOnClose
      >
        <Form<UpsertValues>
          layout="vertical"
          form={form}
          onFinish={(v) => upsertMut.mutate(v)}
        >
          {!editing && (
            <>
              <Form.Item
                label="用户名(登录用,建后不可改)"
                name="username"
                rules={[
                  { required: true, message: '请输入用户名' },
                  { min: 2, message: '至少 2 位' },
                  {
                    pattern: /^[a-zA-Z0-9_.-]+$/,
                    message: '只允许字母、数字、下划线、点、中划线',
                  },
                ]}
              >
                <Input placeholder="如:zhangsan / cashier2" autoFocus />
              </Form.Item>
              <Form.Item
                label="初始密码"
                name="password"
                rules={[
                  { required: true, message: '请输入初始密码' },
                  { min: 6, message: '至少 6 位' },
                ]}
                extra="发给员工后让他自己登进来改"
              >
                <Input.Password placeholder="至少 6 位" />
              </Form.Item>
            </>
          )}
          <Form.Item
            label="显示名"
            name="displayName"
            rules={[{ required: true, message: '请输入显示名' }]}
          >
            <Input placeholder="真实姓名或工号,收银小票上会用到" />
          </Form.Item>
          <Form.Item label="角色" name="role" rules={[{ required: true }]}>
            <Select
              options={ROLE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            />
          </Form.Item>
          {editing && (
            <Form.Item
              label="启用"
              name="isActive"
              valuePropName="checked"
              tooltip="禁用后此账号无法登录,历史订单/入库里的名字仍然保留"
            >
              <Switch
                disabled={me?.id === editing.id}
                checkedChildren="启用"
                unCheckedChildren="禁用"
              />
            </Form.Item>
          )}
          {editing && me?.id === editing.id && (
            <Alert
              type="info"
              showIcon
              message="正在编辑自己的账号"
              description="为防止把自己反锁在外,不能改自己的角色为非管理员,也不能禁用自己。想改密码请用右上角的'修改密码'。"
            />
          )}
        </Form>
      </Modal>

      {/* 重置密码 */}
      <Modal
        title={pwdTarget ? `重置密码 · ${pwdTarget.displayName}` : ''}
        open={!!pwdTarget}
        onOk={() => pwdForm.submit()}
        onCancel={() => setPwdTarget(null)}
        confirmLoading={resetPwdMut.isPending}
        destroyOnClose
      >
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="重置后此账号的旧密码立即失效"
          description="请把新密码通过安全渠道发给员工(不要写在便签上贴屏幕)。员工登进来后建议自己再改一次。"
        />
        <Form
          layout="vertical"
          form={pwdForm}
          onFinish={(v) => resetPwdMut.mutate({ id: pwdTarget!.id, password: v.password })}
        >
          <Form.Item
            label="新密码"
            name="password"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 6, message: '至少 6 位' },
            ]}
          >
            <Input.Password placeholder="至少 6 位" autoFocus />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
