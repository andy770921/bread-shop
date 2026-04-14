import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { PaymentService } from './payment.service';

describe('PaymentService', () => {
  const webhookSecret = 'webhook-secret';

  let service: PaymentService;
  let orderService: {
    getOrderWithItemsForActor: jest.Mock;
    updateOrderStatus: jest.Mock;
  };
  let configService: {
    get: jest.Mock;
  };

  function signPayload(payload: unknown) {
    const rawBody = Buffer.from(JSON.stringify(payload));
    const signature = createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
    return { rawBody, signature };
  }

  beforeEach(() => {
    orderService = {
      getOrderWithItemsForActor: jest.fn(),
      updateOrderStatus: jest.fn().mockResolvedValue(undefined),
    };

    configService = {
      get: jest.fn((key: string) => {
        if (key === 'LEMON_SQUEEZY_WEBHOOK_SECRET') return webhookSecret;
        return undefined;
      }),
    };

    service = new PaymentService(configService as any, orderService as any);

    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('updates paid orders when a valid paid webhook arrives', async () => {
    const { rawBody, signature } = signPayload({
      meta: {
        event_name: 'order_created',
        custom_data: { order_id: '12' },
      },
      data: {
        id: 'ls-12',
        attributes: { status: 'paid' },
      },
    });

    await expect(service.handleWebhook(rawBody, signature)).resolves.toBeUndefined();

    expect(orderService.updateOrderStatus).toHaveBeenCalledWith(12, 'paid', {
      payment_id: 'ls-12',
    });
  });

  it('ignores unknown orders in webhook callbacks', async () => {
    orderService.updateOrderStatus.mockRejectedValueOnce(new NotFoundException('Order not found'));
    const { rawBody, signature } = signPayload({
      meta: {
        event_name: 'order_created',
        custom_data: { order_id: '99' },
      },
      data: {
        id: 'ls-99',
        attributes: { status: 'paid' },
      },
    });

    await expect(service.handleWebhook(rawBody, signature)).resolves.toBeUndefined();

    expect(console.warn).toHaveBeenCalledWith(
      '[Webhook] Ignored order_created paid for unknown order_id=99',
    );
  });

  it('ignores out-of-order paid webhooks that hit an illegal transition', async () => {
    orderService.updateOrderStatus.mockRejectedValueOnce(
      new BadRequestException("Cannot transition from 'shipping' to 'paid'"),
    );
    const { rawBody, signature } = signPayload({
      meta: {
        event_name: 'order_created',
        custom_data: { order_id: '55' },
      },
      data: {
        id: 'ls-55',
        attributes: { status: 'paid' },
      },
    });

    await expect(service.handleWebhook(rawBody, signature)).resolves.toBeUndefined();

    expect(console.warn).toHaveBeenCalledWith(
      "[Webhook] Ignored order_created paid for order_id=55: Cannot transition from 'shipping' to 'paid'",
    );
  });

  it('ignores illegal refund transitions instead of returning 500', async () => {
    orderService.updateOrderStatus.mockRejectedValueOnce(
      new BadRequestException("Cannot transition from 'pending' to 'cancelled'"),
    );
    const { rawBody, signature } = signPayload({
      meta: {
        event_name: 'order_refunded',
        custom_data: { order_id: '18' },
      },
      data: {
        id: 'ls-18',
        attributes: { status: 'refunded' },
      },
    });

    await expect(service.handleWebhook(rawBody, signature)).resolves.toBeUndefined();

    expect(console.warn).toHaveBeenCalledWith(
      "[Webhook] Ignored order_refunded for order_id=18: Cannot transition from 'pending' to 'cancelled'",
    );
  });

  it('still throws unexpected errors', async () => {
    orderService.updateOrderStatus.mockRejectedValueOnce(new Error('database unavailable'));
    const { rawBody, signature } = signPayload({
      meta: {
        event_name: 'order_created',
        custom_data: { order_id: '20' },
      },
      data: {
        id: 'ls-20',
        attributes: { status: 'paid' },
      },
    });

    await expect(service.handleWebhook(rawBody, signature)).rejects.toThrow('database unavailable');
  });
});
