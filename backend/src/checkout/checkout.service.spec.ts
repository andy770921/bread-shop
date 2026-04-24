import { CheckoutService } from './checkout.service';

describe('CheckoutService', () => {
  const frontendUrl = 'https://shop.test';
  const pending = {
    session_id: 'session-1',
    form_data: {
      customerName: 'Andy',
      customerPhone: '0912345678',
      customerEmail: 'andy@example.com',
      customerAddress: 'Taipei',
      notes: 'Ring bell',
      lineId: '@andy',
      pickup_method: 'in_person',
      pickup_location_id: '07a54160-795d-4943-8338-1be861253ecb',
      pickup_at: '2099-12-31T15:00:00+08:00',
      _cart_snapshot: {
        items: [{ product_id: 1, quantity: 2 }],
        subtotal: 400,
        shipping_fee: 60,
        total: 460,
      },
    },
  };
  const authResult = {
    user: { id: 'user-1', email: 'andy@example.com' },
    access_token: 'access-token',
    refresh_token: 'refresh-token',
  };

  let service: CheckoutService;
  let orderService: {
    createOrder: jest.Mock;
    assignUserToOrder: jest.Mock;
    confirmOrder: jest.Mock;
  };
  let authService: {
    mergeSessionOnLogin: jest.Mock;
  };
  let lineService: {
    sendOrderToAdmin: jest.Mock;
    sendOrderMessage: jest.Mock;
  };
  let profileSingleMock: jest.Mock;

  beforeEach(() => {
    orderService = {
      createOrder: jest.fn().mockResolvedValue({ id: 1, order_number: 'ORD-0001' }),
      assignUserToOrder: jest.fn().mockResolvedValue(undefined),
      confirmOrder: jest.fn().mockResolvedValue({ success: true }),
    };
    authService = {
      mergeSessionOnLogin: jest.fn().mockResolvedValue(undefined),
    };
    lineService = {
      sendOrderToAdmin: jest.fn().mockResolvedValue(undefined),
      sendOrderMessage: jest.fn().mockResolvedValue(undefined),
    };
    profileSingleMock = jest.fn().mockResolvedValue({
      data: { line_user_id: 'line-user-1' },
      error: null,
    });

    service = new CheckoutService(
      orderService as any,
      authService as any,
      lineService as any,
      {
        getClient: jest.fn().mockReturnValue({
          from: jest.fn((table: string) => {
            if (table !== 'profiles') {
              throw new Error(`Unexpected table ${table}`);
            }

            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  single: profileSingleMock,
                }),
              }),
            };
          }),
        }),
      } as any,
    );

    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates the order, merges sessions, sends notifications, and returns a success URL', async () => {
    const result = await service.completePendingLineCheckout({
      pending,
      authResult,
      frontendUrl,
    });

    expect(orderService.createOrder).toHaveBeenCalledWith(
      'session-1',
      null,
      {
        customer_name: 'Andy',
        customer_phone: '0912345678',
        customer_email: 'andy@example.com',
        customer_address: 'Taipei',
        notes: 'Ring bell',
        payment_method: 'line',
        customer_line_id: '@andy',
        skip_cart_clear: true,
        pickup_method: 'in_person',
        pickup_location_id: '07a54160-795d-4943-8338-1be861253ecb',
        pickup_at: '2099-12-31T15:00:00+08:00',
      },
      pending.form_data._cart_snapshot,
    );
    expect(orderService.assignUserToOrder).toHaveBeenCalledWith(1, 'user-1');
    expect(authService.mergeSessionOnLogin).toHaveBeenCalledWith('session-1', 'user-1');
    expect(lineService.sendOrderToAdmin).toHaveBeenCalledWith(1);
    expect(lineService.sendOrderMessage).toHaveBeenCalledWith(1, 'line-user-1');
    expect(orderService.confirmOrder).toHaveBeenCalledWith(1, 'session-1', 'user-1');
    expect(orderService.createOrder.mock.invocationCallOrder[0]).toBeLessThan(
      orderService.assignUserToOrder.mock.invocationCallOrder[0],
    );
    expect(orderService.assignUserToOrder.mock.invocationCallOrder[0]).toBeLessThan(
      authService.mergeSessionOnLogin.mock.invocationCallOrder[0],
    );
    expect(result).toBe(
      `${frontendUrl}/checkout/success?order=ORD-0001#access_token=access-token&refresh_token=refresh-token`,
    );
  });

  it('continues when LINE notifications fail', async () => {
    lineService.sendOrderToAdmin.mockRejectedValueOnce(new Error('admin failed'));
    lineService.sendOrderMessage.mockRejectedValueOnce(new Error('customer failed'));

    await expect(
      service.completePendingLineCheckout({
        pending,
        authResult,
        frontendUrl,
      }),
    ).resolves.toContain('/checkout/success?order=ORD-0001');

    expect(orderService.confirmOrder).toHaveBeenCalled();
  });

  it('stops before session merge when order creation fails', async () => {
    orderService.createOrder.mockRejectedValueOnce(new Error('Cart is empty'));

    await expect(
      service.completePendingLineCheckout({
        pending,
        authResult,
        frontendUrl,
      }),
    ).rejects.toThrow('Cart is empty');

    expect(orderService.assignUserToOrder).not.toHaveBeenCalled();
    expect(authService.mergeSessionOnLogin).not.toHaveBeenCalled();
  });

  it('treats confirm-order failure as non-critical', async () => {
    orderService.confirmOrder.mockRejectedValueOnce(new Error('clear cart failed'));

    await expect(
      service.completePendingLineCheckout({
        pending,
        authResult,
        frontendUrl,
      }),
    ).resolves.toBe(
      `${frontendUrl}/checkout/success?order=ORD-0001#access_token=access-token&refresh_token=refresh-token`,
    );
  });
});
