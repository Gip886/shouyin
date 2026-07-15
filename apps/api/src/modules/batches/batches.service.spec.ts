import { diffDays } from './batches.service';

describe('diffDays', () => {
  it('相同日期返回 0', () => {
    const a = new Date('2026-07-15T00:00:00Z');
    const b = new Date('2026-07-15T00:00:00Z');
    expect(diffDays(a, b)).toBe(0);
  });

  it('未来 3 天返回 3', () => {
    const today = new Date('2026-07-15T00:00:00Z');
    const future = new Date('2026-07-18T00:00:00Z');
    expect(diffDays(future, today)).toBe(3);
  });

  it('过去 5 天返回 -5', () => {
    const today = new Date('2026-07-15T00:00:00Z');
    const past = new Date('2026-07-10T00:00:00Z');
    expect(diffDays(past, today)).toBe(-5);
  });

  it('忽略时分秒（避免夏令时/时区偏差）', () => {
    const today = new Date('2026-07-15T00:00:00Z');
    const laterSameDay = new Date('2026-07-15T23:59:59Z');
    expect(diffDays(laterSameDay, today)).toBe(0);
  });
});
