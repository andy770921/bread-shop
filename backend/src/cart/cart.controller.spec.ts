import { CartController } from './cart.controller';

describe('CartController', () => {
  it('passes the authenticated user id into addItem so writes target the active user cart', async () => {
    const cartService = {
      addItem: jest.fn().mockResolvedValue({}),
    };
    const controller = new CartController(cartService as any);

    await controller.addItem(
      {
        sessionId: 'session-1',
        user: { id: 'user-1' },
      } as any,
      { product_id: 101, quantity: 3 },
    );

    expect(cartService.addItem).toHaveBeenCalledWith('session-1', 101, 3, 'user-1');
  });
});
