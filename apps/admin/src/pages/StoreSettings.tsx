import {
  Alert,
  Button,
  Card,
  Divider,
  Form,
  Input,
  Radio,
  Space,
  Spin,
  Switch,
  Typography,
  message,
} from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { getStoreSettings, updateStoreSettings } from '../lib/sdk';
import type { StoreSettings } from '@shouyin/shared';

export default function StoreSettingsPage() {
  const qc = useQueryClient();
  const [form] = Form.useForm<StoreSettings>();

  const { data, isLoading } = useQuery({
    queryKey: ['store-settings'],
    queryFn: getStoreSettings,
  });

  useEffect(() => {
    if (data) form.setFieldsValue(data);
  }, [data, form]);

  const mut = useMutation({
    mutationFn: updateStoreSettings,
    onSuccess: (v) => {
      qc.setQueryData(['store-settings'], v);
      message.success('已保存,收银端将在下次结账时使用新配置');
    },
  });

  if (isLoading) return <Spin />;

  return (
    <div style={{ maxWidth: 720 }}>
      <Typography.Title level={3}>店铺设置</Typography.Title>
      <Typography.Paragraph type="secondary">
        店铺信息会打印到小票抬头。修改后收银端会在下一单自动生效(内存缓存 60s 以内)。
      </Typography.Paragraph>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="小票宽度切换须与实机热敏纸对应,否则会出现缺行或空白边距。"
      />

      <Card>
        <Form<StoreSettings>
          form={form}
          layout="vertical"
          onFinish={(v) => mut.mutate(v)}
        >
          <Form.Item
            label="店铺名称"
            name="storeName"
            rules={[{ required: true, message: '必填' }, { max: 64 }]}
          >
            <Input placeholder="如:巷口便利店" />
          </Form.Item>

          <Space size="middle" style={{ width: '100%' }} align="baseline">
            <Form.Item label="联系电话" name="phone" style={{ flex: 1, minWidth: 220 }}>
              <Input placeholder="选填,会打在小票底部" />
            </Form.Item>
            <Form.Item label="税号 / 统一社会信用代码" name="taxId" style={{ flex: 1, minWidth: 240 }}>
              <Input placeholder="选填" />
            </Form.Item>
          </Space>

          <Form.Item label="门店地址" name="address">
            <Input placeholder="选填,会打在小票抬头" />
          </Form.Item>

          <Divider />

          <Form.Item
            label="小票宽度"
            name="receiptWidthMm"
            tooltip="要与实机热敏纸匹配:多数便携机 58mm,标准桌面机 80mm。"
          >
            <Radio.Group optionType="button" buttonStyle="solid">
              <Radio.Button value={58}>58mm 窄票</Radio.Button>
              <Radio.Button value={80}>80mm 标准</Radio.Button>
            </Radio.Group>
          </Form.Item>

          <Form.Item
            label="小票底部文字"
            name="receiptFooter"
            rules={[{ max: 120 }]}
          >
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} placeholder="谢谢惠顾 · 欢迎再次光临" />
          </Form.Item>

          <Divider>打印行为</Divider>

          <Form.Item
            label="结账后自动打印小票"
            name="autoPrintReceipt"
            valuePropName="checked"
            tooltip="关闭后只能在成功弹窗按 P 手动补打;顾客不需要小票的门店可以关掉省纸"
          >
            <Switch checkedChildren="开" unCheckedChildren="关" />
          </Form.Item>

          <Form.Item
            label="允许通过浏览器打印(不推荐)"
            name="allowBrowserPrint"
            valuePropName="checked"
            tooltip={
              <span>
                默认关闭,走本地打印桥服务(VITE_PRINTER_URL);
                <br />
                打开后当桥不可用时会退回 window.print,可能弹打印对话框、选错打印机。
                只在没有对接热敏机、调试排版时开启。
              </span>
            }
          >
            <Switch checkedChildren="允许" unCheckedChildren="禁止" />
          </Form.Item>

          <Divider />
          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={mut.isPending}>
              保存
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
