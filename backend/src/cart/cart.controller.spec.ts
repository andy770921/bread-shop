import { CartController } from './cart.controller';

describe('CartController', () => {
  const cartService = {
    addItem: jest.fn().mockResolvedValue({}),
  };
  const draftService = {
    getForSession: jest.fn().mockResolvedValue(null),
    upsertForSession: jest.fn().mockResolvedValue({}),
    clearForSession: jest.fn().mockResolvedValue(undefined),
  };

  let controller: CartController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new CartController(cartService as any, draftService as any);
  });

  it('passes the authenticated user id into addItem so writes target the active user cart', async () => {
    await controller.addItem(
      {
        sessionId: 'session-1',
        user: { id: 'user-1' },
      } as any,
      { product_id: 101, quantity: 3 },
    );

    expect(cartService.addItem).toHaveBeenCalledWith('session-1', 101, 3, 'user-1');
  });

  it('GET contact-draft delegates to draftService with sessionId', async () => {
    const draft = { customerName: 'Jane' };
    draftService.getForSession.mockResolvedValue(draft);

    const result = await controller.getContactDraft({ sessionId: 'session-1' } as any);

    expect(draftService.getForSession).toHaveBeenCalledWith('session-1');
    expect(result).toBe(draft);
  });

  it('GET contact-draft returns null when no session exists', async () => {
    const result = await controller.getContactDraft({ sessionId: undefined } as any);

    expect(draftService.getForSession).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it('PUT contact-draft passes sessionId, userId, and dto to draftService', async () => {
    const dto = { customerName: 'Jane', customerPhone: '0912345678' };
    const saved = { ...dto, customerEmail: '', customerAddress: '', notes: '', lineId: '' };
    draftService.upsertForSession.mockResolvedValue(saved);

    const result = await controller.updateContactDraft(
      { sessionId: 'session-1', user: { id: 'user-1' } } as any,
      dto as any,
    );

    expect(draftService.upsertForSession).toHaveBeenCalledWith('session-1', 'user-1', dto);
    expect(result).toBe(saved);
  });

  it('DELETE contact-draft clears the correct session', async () => {
    await controller.clearContactDraft({ sessionId: 'session-1' } as any);

    expect(draftService.clearForSession).toHaveBeenCalledWith('session-1');
  });
});
