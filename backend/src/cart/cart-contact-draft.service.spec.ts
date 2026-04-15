import { CartContactDraftService } from './cart-contact-draft.service';

describe('CartContactDraftService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  function buildSupabase(overrides: Record<string, any> = {}) {
    const singleMock = jest.fn().mockResolvedValue({ data: null, error: null });
    const maybeSingleMock = jest.fn().mockResolvedValue({ data: null, error: null });
    const selectMock = jest
      .fn()
      .mockReturnValue({ single: singleMock, maybeSingle: maybeSingleMock });
    const deleteMock = jest
      .fn()
      .mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) });
    const upsertMock = jest.fn().mockReturnValue({ select: selectMock });
    const gtMock = jest.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
    const eqMock = jest.fn().mockReturnValue({ gt: gtMock, ...overrides });

    const fromMock = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({ eq: eqMock }),
      upsert: upsertMock,
      delete: deleteMock,
    });

    return {
      fromMock,
      singleMock,
      maybeSingleMock,
      deleteMock,
      upsertMock,
      supabase: { from: fromMock },
    };
  }

  it('returns null when no draft exists for the session', async () => {
    const { supabase } = buildSupabase();
    const service = new CartContactDraftService({ getClient: () => supabase } as any);

    const result = await service.getForSession('session-1');

    expect(result).toBeNull();
    expect(supabase.from).toHaveBeenCalledWith('checkout_contact_drafts');
  });

  it('returns mapped draft when a non-expired row exists', async () => {
    const row = {
      customer_name: 'Jane',
      customer_phone: '0912345678',
      customer_email: 'jane@example.com',
      customer_address: 'Taipei',
      notes: 'ring bell',
      payment_method: 'line_transfer',
      line_id: '@jane',
    };
    const { supabase, maybeSingleMock } = buildSupabase();
    maybeSingleMock.mockResolvedValue({ data: row, error: null });
    const service = new CartContactDraftService({ getClient: () => supabase } as any);

    const result = await service.getForSession('session-1');

    expect(result).toEqual({
      customerName: 'Jane',
      customerPhone: '0912345678',
      customerEmail: 'jane@example.com',
      customerAddress: 'Taipei',
      notes: 'ring bell',
      paymentMethod: 'line_transfer',
      lineId: '@jane',
    });
  });

  it('upserts and returns the saved draft with trimmed fields', async () => {
    const savedRow = {
      customer_name: 'Jane',
      customer_phone: '0912345678',
      customer_email: null,
      customer_address: 'Taipei',
      notes: null,
      payment_method: null,
      line_id: null,
    };
    const { supabase, singleMock } = buildSupabase();
    singleMock.mockResolvedValue({ data: savedRow, error: null });
    const service = new CartContactDraftService({ getClient: () => supabase } as any);

    const result = await service.upsertForSession('session-1', 'user-1', {
      customerName: '  Jane  ',
      customerPhone: '0912345678',
      customerEmail: '   ',
      customerAddress: 'Taipei',
    });

    expect(result).toEqual({
      customerName: 'Jane',
      customerPhone: '0912345678',
      customerEmail: '',
      customerAddress: 'Taipei',
      notes: '',
      paymentMethod: undefined,
      lineId: '',
    });
  });

  it('clears the draft for a session', async () => {
    const eqMock = jest.fn().mockResolvedValue({ error: null });
    const deleteMock = jest.fn().mockReturnValue({ eq: eqMock });
    const supabase = {
      from: jest.fn().mockReturnValue({ delete: deleteMock }),
    };
    const service = new CartContactDraftService({ getClient: () => supabase } as any);

    await service.clearForSession('session-1');

    expect(supabase.from).toHaveBeenCalledWith('checkout_contact_drafts');
    expect(deleteMock).toHaveBeenCalled();
    expect(eqMock).toHaveBeenCalledWith('session_id', 'session-1');
  });
});
