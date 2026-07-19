import { Alert, Form, Input, Modal, message } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { changeOwnPassword } from '../lib/sdk';
import { clearSession } from '../lib/api';
import { useNavigate } from 'react-router-dom';

/**
 * 修改自己的密码。需要旧密码(避免同事借电脑改)。
 * 改成功后强制登出 —— 因为 accessToken 还是老的,虽然后端不校验密码变化,
 * 但清一遍 token 更符合直觉("改完密码请重新登录")。
 */
export default function ChangePasswordModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [form] = Form.useForm<{
    oldPassword: string;
    newPassword: string;
    confirm: string;
  }>();
  const nav = useNavigate();

  const mut = useMutation({
    mutationFn: (v: { oldPassword: string; newPassword: string }) =>
      changeOwnPassword(v.oldPassword, v.newPassword),
    onSuccess: () => {
      message.success('密码已修改,请用新密码重新登录');
      form.resetFields();
      onClose();
      clearSession();
      nav('/login', { replace: true });
    },
    onError: (err: any) => {
      const raw = err?.response?.data?.message;
      const msg = Array.isArray(raw) ? raw.join('；') : raw ?? err?.message;
      message.error(msg || '修改失败');
    },
  });

  return (
    <Modal
      title="修改密码"
      open={open}
      onCancel={() => {
        form.resetFields();
        onClose();
      }}
      onOk={() => form.submit()}
      confirmLoading={mut.isPending}
      destroyOnClose
      okText="保存并重新登录"
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="改完密码会自动退出,用新密码重新登录一次"
      />
      <Form
        layout="vertical"
        form={form}
        onFinish={(v) =>
          mut.mutate({ oldPassword: v.oldPassword, newPassword: v.newPassword })
        }
      >
        <Form.Item
          label="当前密码"
          name="oldPassword"
          rules={[{ required: true, message: '请输入当前密码' }]}
        >
          <Input.Password autoFocus />
        </Form.Item>
        <Form.Item
          label="新密码"
          name="newPassword"
          rules={[
            { required: true, message: '请输入新密码' },
            { min: 6, message: '至少 6 位' },
          ]}
        >
          <Input.Password placeholder="至少 6 位" />
        </Form.Item>
        <Form.Item
          label="确认新密码"
          name="confirm"
          dependencies={['newPassword']}
          rules={[
            { required: true, message: '请再次输入' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('newPassword') === value) {
                  return Promise.resolve();
                }
                return Promise.reject(new Error('两次输入不一致'));
              },
            }),
          ]}
        >
          <Input.Password />
        </Form.Item>
      </Form>
    </Modal>
  );
}
