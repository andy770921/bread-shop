import { BadRequestException } from '@nestjs/common';
import { OrderService } from './order.service';

describe('OrderService', () => {
  describe('updateOrderStatus', () => {
    let service: OrderService;
    let fromMock: jest.Mock;
    let updateMock: jest.Mock;
    let eqMock: jest.Mock;
    let selectMock: jest.Mock;
    let singleMock: jest.Mock;

    beforeEach(() => {
      singleMock = jest.fn().mockResolvedValue({ data: { id: 1 }, error: null });
      selectMock = jest.fn().mockReturnValue({ single: singleMock });
      eqMock = jest.fn().mockReturnValue({ select: selectMock });
      updateMock = jest.fn().mockReturnValue({ eq: eqMock });
      fromMock = jest.fn().mockReturnValue({ update: updateMock });

      service = new OrderService(
        {
          getClient: jest.fn().mockReturnValue({
            from: fromMock,
          }),
        } as any,
        {} as any,
        { clearForSession: jest.fn().mockResolvedValue(undefined) } as any,
        { loadValidationBundle: jest.fn() } as any,
      );
    });

    it('updates legal transitions through the orders table owner', async () => {
      jest.spyOn(service, 'getOrderWithItems').mockResolvedValue({
        id: 1,
        order_number: 'ORD-1',
        status: 'pending',
      } as any);

      await service.updateOrderStatus(1, 'paid', { payment_id: 'payment-1' });

      expect(fromMock).toHaveBeenCalledWith('orders');
      expect(updateMock).toHaveBeenCalledWith({ status: 'paid', payment_id: 'payment-1' });
      expect(eqMock).toHaveBeenCalledWith('id', 1);
    });

    it('treats duplicate webhook transitions as a no-op', async () => {
      jest.spyOn(service, 'getOrderWithItems').mockResolvedValue({
        id: 1,
        order_number: 'ORD-1',
        status: 'paid',
      } as any);

      await service.updateOrderStatus(1, 'paid', { payment_id: 'payment-1' });

      expect(updateMock).not.toHaveBeenCalled();
    });

    it('rejects illegal transitions', async () => {
      jest.spyOn(service, 'getOrderWithItems').mockResolvedValue({
        id: 1,
        order_number: 'ORD-1',
        status: 'cancelled',
      } as any);

      await expect(service.updateOrderStatus(1, 'paid')).rejects.toThrow(BadRequestException);
      expect(updateMock).not.toHaveBeenCalled();
    });
  });

  describe('confirmOrder', () => {
    it('clears the contact draft after successful confirmation', async () => {
      const clearCart = jest.fn().mockResolvedValue({});
      const clearDraft = jest.fn().mockResolvedValue(undefined);

      const service = new OrderService(
        { getClient: jest.fn() } as any,
        { clearCart } as any,
        { clearForSession: clearDraft } as any,
        { loadValidationBundle: jest.fn() } as any,
      );

      jest.spyOn(service as any, 'getOrderWithItemsForActor').mockResolvedValue({ id: 1 });

      await service.confirmOrder(1, 'session-1', 'user-1');

      expect(clearCart).toHaveBeenCalledWith('session-1', 'user-1');
      expect(clearDraft).toHaveBeenCalledWith('session-1');
    });
  });
});
