import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class PaymentService {
  constructor(
    private configService: ConfigService,
    private supabaseService: SupabaseService,
  ) {}

  async createCheckout(
    orderId: number,
    sessionId?: string,
    userId?: string,
  ): Promise<string> {
    const supabase = this.supabaseService.getClient();

    let query = supabase
      .from('orders')
      .select('*, items:order_items(*)')
      .eq('id', orderId);

    if (userId) {
      query = query.eq('user_id', userId);
    } else if (sessionId) {
      query = query.eq('session_id', sessionId);
    }

    const { data: order } = await query.single();

    if (!order)
      throw new BadRequestException('Order not found or access denied');
    if (order.status !== 'pending')
      throw new BadRequestException('Order already processed');

    const apiKey = this.configService.get('LEMON_SQUEEZY_API_KEY');
    if (!apiKey) {
      throw new BadRequestException(
        'Payment service not configured. Please contact the shop.',
      );
    }

    // Lemon Squeezy checkout creation will be implemented when API key is available
    // For now, return a placeholder
    throw new BadRequestException(
      'Lemon Squeezy payment is not yet configured.',
    );
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
        const supabase = this.supabaseService.getClient();
        const { data } = await supabase
          .from('orders')
          .update({ status: 'paid', payment_id: lsOrderId })
          .eq('id', parseInt(orderId))
          .select('id')
          .single();

        if (!data) {
          console.warn(
            `[Webhook] Lemon Squeezy order_created for unknown order_id=${orderId}, ls_order=${lsOrderId}`,
          );
        }
      }
    }

    if (eventName === 'order_refunded') {
      if (orderId) {
        const supabase = this.supabaseService.getClient();
        await supabase
          .from('orders')
          .update({ status: 'cancelled' })
          .eq('id', parseInt(orderId));
      }
    }
  }
}
