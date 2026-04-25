import { BadRequestException } from '@nestjs/common';
import { InventoryService } from './inventory.service';

function makeService(opts: {
  inventoryMode: 'unlimited' | 'daily_total';
  dailyTotalLimit?: number;
  rpcRows?: Array<{ pickup_date: string; total_quantity: number | string }>;
}) {
  const rpc = jest.fn().mockResolvedValue({ data: opts.rpcRows ?? [], error: null });
  const supabase = { getClient: () => ({ rpc }) } as any;
  const shopSettings = {
    getSettingsFresh: jest.fn().mockResolvedValue({
      shippingEnabled: true,
      shippingFee: 60,
      freeShippingThreshold: 500,
      promoBannerEnabled: true,
      inventoryMode: opts.inventoryMode,
      dailyTotalLimit: opts.dailyTotalLimit ?? 3,
    }),
    getSettings: jest.fn().mockResolvedValue({
      shippingEnabled: true,
      shippingFee: 60,
      freeShippingThreshold: 500,
      promoBannerEnabled: true,
      inventoryMode: opts.inventoryMode,
      dailyTotalLimit: opts.dailyTotalLimit ?? 3,
    }),
  } as any;
  return { service: new InventoryService(supabase, shopSettings), rpc, shopSettings };
}

describe('[InventoryService] getAvailability', () => {
  it('returns unlimited shape and no fullDates when mode is unlimited', async () => {
    const { service, rpc } = makeService({ inventoryMode: 'unlimited' });
    const out = await service.getAvailability();
    expect(out).toEqual({ mode: 'unlimited', limit: null, fullDates: [] });
    // Unlimited short-circuits BEFORE the RPC fires.
    expect(rpc).not.toHaveBeenCalled();
  });

  it('lists every date whose total_quantity meets or exceeds the limit', async () => {
    const { service } = makeService({
      inventoryMode: 'daily_total',
      dailyTotalLimit: 3,
      rpcRows: [
        { pickup_date: '2026-05-01', total_quantity: 1 },
        { pickup_date: '2026-05-02', total_quantity: 3 },
        { pickup_date: '2026-05-03', total_quantity: 5 },
      ],
    });
    const out = await service.getAvailability();
    expect(out).toEqual({
      mode: 'daily_total',
      limit: 3,
      fullDates: ['2026-05-02', '2026-05-03'],
    });
  });

  it('handles bigint string serialisation from the RPC', async () => {
    const { service } = makeService({
      inventoryMode: 'daily_total',
      dailyTotalLimit: 3,
      rpcRows: [{ pickup_date: '2026-05-04', total_quantity: '4' }],
    });
    const out = await service.getAvailability();
    expect(out.fullDates).toEqual(['2026-05-04']);
  });
});

describe('[InventoryService] assertHasCapacity', () => {
  it('is a no-op when mode is unlimited', async () => {
    const { service, rpc } = makeService({ inventoryMode: 'unlimited' });
    await service.assertHasCapacity(new Date('2026-05-01T12:00:00+08:00'), 5);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('allows submit when currentLoad + add equals the limit', async () => {
    const { service } = makeService({
      inventoryMode: 'daily_total',
      dailyTotalLimit: 3,
      rpcRows: [{ pickup_date: '2026-05-01', total_quantity: 1 }],
    });
    await expect(
      service.assertHasCapacity(new Date('2026-05-01T12:00:00+08:00'), 2),
    ).resolves.toBeUndefined();
  });

  it('rejects when currentLoad + add exceeds the limit', async () => {
    const { service } = makeService({
      inventoryMode: 'daily_total',
      dailyTotalLimit: 3,
      rpcRows: [{ pickup_date: '2026-05-01', total_quantity: 2 }],
    });
    await expect(
      service.assertHasCapacity(new Date('2026-05-01T12:00:00+08:00'), 2),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('emits the structured error body the customer FE matches on', async () => {
    const { service } = makeService({
      inventoryMode: 'daily_total',
      dailyTotalLimit: 3,
      rpcRows: [{ pickup_date: '2026-05-01', total_quantity: 3 }],
    });
    let caught: BadRequestException | null = null;
    try {
      await service.assertHasCapacity(new Date('2026-05-01T12:00:00+08:00'), 1);
    } catch (err) {
      caught = err as BadRequestException;
    }
    expect(caught).not.toBeNull();
    const body = caught!.getResponse() as Record<string, unknown>;
    expect(body).toMatchObject({
      code: 'daily_inventory_full',
      date: '2026-05-01',
      limit: 3,
      currentLoad: 3,
    });
  });

  it('uses fresh settings (bypasses 30s cache) so a freshly-lowered cap takes effect', async () => {
    const { service, shopSettings } = makeService({
      inventoryMode: 'daily_total',
      dailyTotalLimit: 3,
      rpcRows: [{ pickup_date: '2026-05-01', total_quantity: 1 }],
    });
    await service.assertHasCapacity(new Date('2026-05-01T12:00:00+08:00'), 1);
    expect(shopSettings.getSettingsFresh).toHaveBeenCalled();
    expect(shopSettings.getSettings).not.toHaveBeenCalled();
  });

  it('buckets by Asia/Taipei date — a UTC instant just past midnight UTC may still be the same Taipei date', async () => {
    // 2026-05-01 17:30 UTC = 2026-05-02 01:30 Taipei → bucket 2026-05-02
    const { service } = makeService({
      inventoryMode: 'daily_total',
      dailyTotalLimit: 3,
      rpcRows: [{ pickup_date: '2026-05-02', total_quantity: 3 }],
    });
    await expect(
      service.assertHasCapacity(new Date('2026-05-01T17:30:00Z'), 1),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
