import { Button, Form, Input, Popup, Toast } from 'antd-mobile';
import { useState } from 'react';
import { changeOwnPassword } from '../lib/sdk';
import { clearSession } from '../lib/api';
import { useNavigate } from 'react-router-dom';

/**
 * 移动端改密码。跟 admin/pos 的 Modal 语义一致,只是用 antd-mobile 的 Popup + Form。
 * 成功后清 session 让员工用新密码重登(mobile 上直接跳 /login,不会因为 token 老而报 401 死循环)。
 */
export default function ChangePasswordSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const [form] = Form.useForm();
  const nav = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    try {
      await form.validateFields();
    } catch {
      return;
    }
    const v = form.getFieldsValue() as {
      oldPassword: string;
      newPassword: string;
      confirm: string;
    };
    if (v.newPassword !== v.confirm) {
      Toast.show({ content: '两次新密码不一致' });
      return;
    }
    setSubmitting(true);
    try {
      await changeOwnPassword(v.oldPassword, v.newPassword);
      Toast.show({ icon: 'success', content: '已修改,请重新登录' });
      form.resetFields();
      onClose();
      clearSession();
      nav('/login', { replace: true });
    } catch (e: any) {
      const raw = e?.response?.data?.message;
      const msg = Array.isArray(raw) ? raw.join('；') : raw ?? e?.message;
      Toast.show({ icon: 'fail', content: msg || '修改失败' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Popup
      visible={visible}
      onMaskClick={() => onClose()}
      onClose={onClose}
      bodyStyle={{ borderTopLeftRadius: 12, borderTopRightRadius: 12 }}
    >
      <div style={{ padding: '16px 20px' }}>
        <h3 style={{ margin: '0 0 12px' }}>修改密码</h3>
        <p style={{ margin: '0 0 12px', color: '#888', fontSize: 13 }}>
          改完会自动退出登录,请用新密码重新登入。
        </p>
        <Form
          form={form}
          layout="horizontal"
          footer={
            <Button
              block
              color="primary"
              loading={submitting}
              onClick={submit}
              size="large"
            >
              保存并重新登录
            </Button>
          }
        >
          <Form.Item
            label="当前密码"
            name="oldPassword"
            rules={[{ required: true, message: '请输入当前密码' }]}
          >
            <Input type="password" placeholder="当前登录密码" />
          </Form.Item>
          <Form.Item
            label="新密码"
            name="newPassword"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 6, message: '至少 6 位' },
            ]}
          >
            <Input type="password" placeholder="至少 6 位" />
          </Form.Item>
          <Form.Item
            label="再输一次"
            name="confirm"
            rules={[{ required: true, message: '再输一次' }]}
          >
            <Input type="password" placeholder="确认新密码" />
          </Form.Item>
        </Form>
      </div>
    </Popup>
  );
}
