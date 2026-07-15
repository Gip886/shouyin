import {
  Button,
  Card,
  DatePicker,
  Dialog,
  Form,
  Input,
  List,
  Stepper,
  Toast,
} from 'antd-mobile';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import dayjs from 'dayjs';
import Scanner from '../components/Scanner';
import { createBatch, findProductByBarcode, type Product } from '../lib/sdk';

/**
 * 入库页:
 *   扫码 → 查商品 → 填生产日期 / 保质期天数 / 数量 / 成本价 → 提交
 * 提交后清空表单,回到扫码状态,可连续入库
 */
export default function InboundPage() {
  const qc = useQueryClient();
  const [product, setProduct] = useState<Product | null>(null);
  const [productionDate, setProductionDate] = useState<Date | null>(
    dayjs().startOf('day').toDate(),
  );
  const [shelfLifeDays, setShelfLifeDays] = useState(365);
  const [quantity, setQuantity] = useState(1);
  const [costPrice, setCostPrice] = useState('');
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [scannerKey, setScannerKey] = useState(0); // 用于重新挂载 Scanner 组件重启摄像头

  const reset = () => {
    setProduct(null);
    setProductionDate(dayjs().startOf('day').toDate());
    setShelfLifeDays(365);
    setQuantity(1);
    setCostPrice('');
    setScannerKey((k) => k + 1);
  };

  const onDetected = async (code: string) => {
    Toast.show({ content: `识别到:${code}`, duration: 800 });
    try {
      const p = await findProductByBarcode(code);
      if (!p) {
        Dialog.alert({
          title: '未找到商品',
          content: `条码 ${code} 在系统中不存在。请先在后台创建商品,再入库。`,
          confirmText: '知道了',
        });
        setScannerKey((k) => k + 1);
        return;
      }
      setProduct(p);
      if (p.costPrice) setCostPrice(p.costPrice);
    } catch {
      setScannerKey((k) => k + 1);
    }
  };

  const submit = useMutation({
    mutationFn: async () => {
      if (!product) throw new Error('未选商品');
      if (!productionDate) throw new Error('请选择生产日期');
      if (shelfLifeDays <= 0) throw new Error('保质期天数需 > 0');
      if (quantity <= 0) throw new Error('数量需 > 0');
      if (!costPrice || Number(costPrice) < 0) throw new Error('请填成本价');
      const expiry = dayjs(productionDate).add(shelfLifeDays, 'day');
      return createBatch({
        productId: product.id,
        productionDate: dayjs(productionDate).format('YYYY-MM-DD'),
        expiryDate: expiry.format('YYYY-MM-DD'),
        quantity,
        costPrice,
      });
    },
    onSuccess: (b) => {
      Toast.show({ icon: 'success', content: `已入库:${b.batchNo}` });
      qc.invalidateQueries({ queryKey: ['near-expiry'] });
      reset();
    },
    onError: (e: any) => {
      Toast.show({ icon: 'fail', content: e?.message ?? '入库失败' });
    },
  });

  const expiryPreview = productionDate
    ? dayjs(productionDate).add(shelfLifeDays, 'day').format('YYYY-MM-DD')
    : '-';

  return (
    <div style={{ padding: 12 }}>
      {!product ? (
        <Card title="扫描或输入商品条码">
          <Scanner key={scannerKey} onDetected={onDetected} showManualInput />
        </Card>
      ) : (
        <>
          <Card
            title={product.name}
            extra={
              <span style={{ color: '#1677ff', fontSize: 12 }} onClick={reset}>
                重新扫码
              </span>
            }
          >
            <div style={{ fontSize: 12, color: '#8c8c8c' }}>
              <div>条码 {product.barcode}</div>
              <div>单位 {product.unit} · 售价 ¥{product.salePrice}</div>
            </div>
          </Card>

          <Card style={{ marginTop: 12 }} title="批次信息">
            <List>
              <List.Item
                title="生产日期"
                extra={
                  <span
                    style={{ color: productionDate ? '#333' : '#ccc' }}
                    onClick={() => setDatePickerOpen(true)}
                  >
                    {productionDate
                      ? dayjs(productionDate).format('YYYY-MM-DD')
                      : '请选择'}
                  </span>
                }
                onClick={() => setDatePickerOpen(true)}
                arrow
              />
              <List.Item
                title="保质期(天)"
                extra={
                  <Stepper
                    min={1}
                    max={3650}
                    step={1}
                    value={shelfLifeDays}
                    onChange={setShelfLifeDays}
                  />
                }
              />
              <List.Item title="到期日预览" extra={<b>{expiryPreview}</b>} />
              <List.Item
                title="入库数量"
                extra={
                  <Stepper
                    min={1}
                    step={1}
                    value={quantity}
                    onChange={setQuantity}
                  />
                }
              />
              <List.Item title="成本单价">
                <Input
                  placeholder="0.00"
                  type="number"
                  value={costPrice}
                  onChange={setCostPrice}
                  style={{ textAlign: 'right' }}
                />
              </List.Item>
            </List>
          </Card>

          <Button
            block
            color="primary"
            size="large"
            style={{ marginTop: 16 }}
            loading={submit.isPending}
            onClick={() => submit.mutate()}
          >
            提交入库
          </Button>

          <DatePicker
            visible={datePickerOpen}
            value={productionDate ?? new Date()}
            precision="day"
            max={new Date()}
            title="生产日期"
            onClose={() => setDatePickerOpen(false)}
            onConfirm={(v) => setProductionDate(v)}
          />
        </>
      )}
    </div>
  );
}
