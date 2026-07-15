import {
  Badge,
  Button,
  Card,
  List,
  Space,
  Tag,
  Typography,
  message,
} from 'antd';
import { CheckOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { listNotifications, markNotificationRead, runDailyScan } from '../lib/sdk';

export default function NotificationsPage() {
  const qc = useQueryClient();
  const { data = [], isFetching, refetch } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => listNotifications(false),
  });

  const readMut = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const scanMut = useMutation({
    mutationFn: runDailyScan,
    onSuccess: (r) => {
      message.success(`扫描完成：过期 ${r.expired}，临期 ${r.nearExpiry}`);
      refetch();
    },
  });

  return (
    <Card
      title="通知中心"
      extra={
        <Button
          type="primary"
          icon={<ThunderboltOutlined />}
          onClick={() => scanMut.mutate()}
          loading={scanMut.isPending}
        >
          手动触发每日扫描
        </Button>
      }
    >
      <List
        loading={isFetching}
        dataSource={data}
        locale={{ emptyText: '暂无通知' }}
        renderItem={(item) => (
          <List.Item
            actions={[
              !item.readAt && (
                <Button
                  key="read"
                  size="small"
                  icon={<CheckOutlined />}
                  onClick={() => readMut.mutate(item.id)}
                >
                  标为已读
                </Button>
              ),
            ].filter(Boolean) as React.ReactNode[]}
          >
            <List.Item.Meta
              avatar={
                <Badge dot={!item.readAt} offset={[-4, 4]}>
                  <Tag color={item.kind === 'DAILY_EXPIRY_REPORT' ? 'red' : 'blue'}>
                    {item.kind}
                  </Tag>
                </Badge>
              }
              title={
                <Space>
                  <span>{item.title}</span>
                  {!item.readAt && <Tag color="orange">未读</Tag>}
                </Space>
              }
              description={
                <>
                  <Typography.Paragraph style={{ marginBottom: 4 }}>
                    {item.body}
                  </Typography.Paragraph>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {dayjs(item.createdAt).format('YYYY-MM-DD HH:mm:ss')}
                  </Typography.Text>
                </>
              }
            />
          </List.Item>
        )}
      />
    </Card>
  );
}
