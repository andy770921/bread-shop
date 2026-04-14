import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderService } from '../order/order.service';

@Injectable()
export class PaymentService {
  constructor(
    private configService: ConfigService,
    private orderService: OrderService,
  ) {}

  async createCheckout(orderId: number, sessionId?: string, userId?: string): Promise<string> {
    const order = await this.orderService.getOrderWithItemsForActor(orderId, sessionId, userId);
    if (order.status !== 'pending') throw new BadRequestException('Order already processed');

    const apiKey = this.configService.get('LEMON_SQUEEZY_API_KEY');
    if (!apiKey) {
      throw new BadRequestException('Payment service not configured. Please contact the shop.');
    }

    // Lemon Squeezy checkout creation will be implemented when API key is available
    // For now, return a placeholder
    throw new BadRequestException('Lemon Squeezy payment is not yet configured.');
  }

  async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    const crypto = await import('crypto');
    const secret = this.configService.get('LEMON_SQUEEZY_WEBHOOK_SECRET');

    if (!secret) return;

    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(rawBody);
    const digest = hmac.digest('hex');

    const signatureBuffer = Buffer.from(signature, 'hex');
    const digestBuffer = Buffer.from(digest, 'hex');
    if (
      signatureBuffer.length !== digestBuffer.length ||
      !crypto.timingSafeEqual(digestBuffer, signatureBuffer)
    ) {
      throw new BadRequestException('Invalid webhook signature');
    }

    const event = JSON.parse(rawBody.toString());
    const eventName = event.meta?.event_name;
    const customData = event.meta?.custom_data;
    const orderId = customData?.order_id;
    const lsOrderId = String(event.data?.id);

    if (eventName === 'order_created') {
      const status = event.data?.attributes?.status;

      if (orderId && status === 'paid') {
        await this.updateOrderStatusFromWebhook(
          parseInt(orderId, 10),
          'paid',
          `order_created paid`,
          { payment_id: lsOrderId },
        );
      }
    }

    if (eventName === 'order_refunded') {
      if (orderId) {
        await this.updateOrderStatusFromWebhook(
          parseInt(orderId, 10),
          'cancelled',
          'order_refunded',
        );
      }
    }
  }

  private async updateOrderStatusFromWebhook(
    orderId: number,
    newStatus: 'paid' | 'cancelled',
    eventLabel: string,
    extra?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.orderService.updateOrderStatus(orderId, newStatus, extra);
    } catch (error) {
      if (error instanceof NotFoundException) {
        console.warn(`[Webhook] Ignored ${eventLabel} for unknown order_id=${orderId}`);
        return;
      }

      if (error instanceof BadRequestException) {
        console.warn(
          `[Webhook] Ignored ${eventLabel} for order_id=${orderId}: ${error.message}`,
        );
        return;
      }

      throw error;
    }
  }
}
