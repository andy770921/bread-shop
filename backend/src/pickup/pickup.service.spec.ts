import { BadRequestException } from '@nestjs/common';
import { PickupService } from './pickup.service';

function makeSupabaseMock() {
  const updatedRow = {
    id: 'loc-1',
    label_zh: 'Holland',
    label_en: 'Holland',
    sort_order: 0,
    is_active: true,
  };
  const updateSingle = jest.fn().mockResolvedValue({ data: updatedRow, error: null });
  const updateSelect = jest.fn().mockReturnValue({ single: updateSingle });
  const updateEq = jest.fn().mockReturnValue({ select: updateSelect });
  const updateMock = jest.fn().mockReturnValue({ eq: updateEq });

  const countNeq = jest.fn().mockResolvedValue({ count: 5, error: null });
  const countEq = jest.fn().mockReturnValue({ neq: countNeq });
  const selectHeadMock = jest.fn().mockReturnValue({ eq: countEq });

  const fromMock = jest.fn().mockImplementation((table: string) => {
    if (table !== 'pickup_locations') {
      throw new Error(`unexpected table ${table}`);
    }
    return {
      update: updateMock,
      select: selectHeadMock,
    };
  });

  return {
    client: { from: fromMock },
    updateMock,
    updateEq,
    updateSingle,
  };
}

describe('PickupService.updateLocation label hygiene', () => {
  it('rejects whitespace-only label_zh after trim', async () => {
    const mock = makeSupabaseMock();
    const service = new PickupService({ getClient: () => mock.client } as any);

    await expect(
      service.updateLocation('loc-1', { label_zh: '   ' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mock.updateMock).not.toHaveBeenCalled();
  });

  it('rejects whitespace-only label_en after trim', async () => {
    const mock = makeSupabaseMock();
    const service = new PickupService({ getClient: () => mock.client } as any);

    await expect(
      service.updateLocation('loc-1', { label_en: '\t\n' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mock.updateMock).not.toHaveBeenCalled();
  });

  it('trims a padded non-empty label and persists the trimmed value', async () => {
    const mock = makeSupabaseMock();
    const service = new PickupService({ getClient: () => mock.client } as any);

    await service.updateLocation('loc-1', { label_zh: '  Holland  ' } as any);

    expect(mock.updateMock).toHaveBeenCalledWith(expect.objectContaining({ label_zh: 'Holland' }));
  });

  it('lets boolean is_active=false through when not the last active location', async () => {
    const mock = makeSupabaseMock();
    const service = new PickupService({ getClient: () => mock.client } as any);

    await service.updateLocation('loc-1', { is_active: false } as any);

    expect(mock.updateMock).toHaveBeenCalledWith(expect.objectContaining({ is_active: false }));
  });
});
