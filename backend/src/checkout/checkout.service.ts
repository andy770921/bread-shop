import { BadRequestException, Injectable } from '@nestjs/common';
import type { PickupMethod } from '@repo/shared';
import { AuthService } from '../auth/auth.service';
import { LineService } from '../line/line.service';
import { OrderService } from '../order/order.service';
import { SupabaseService } from '../supabase/supabase.service';

type PendingOrder = { session_id: string; form_data: Record<string, unknown> };
type CheckoutAuthResult = {
  user: { id: string; email: string };
  access_token?: string;
  refresh_token?: string;
};

@Injectable()
export class CheckoutService {
  constructor(
    private readonly orderService: OrderService,
    private readonly authService: AuthService,
    private readonly lineService: LineService,
    private readonly supabaseService: SupabaseService,
  ) {}

  async completePendingLineCheckout(params: {
    pending: PendingOrder;
    authResult: CheckoutAuthResult;
    frontendUrl: string;
  }): Promise<string> {
    const { pending, authResult, frontendUrl } = params;
    const fd = pending.form_data;

    const cartSnapshot = fd._cart_snapshot as
      | { items: any[]; subtotal: number; shipping_fee: number; total: number }
      | undefined;

    const pickupMethod = fd.pickup_method as PickupMethod | undefined;
    const pickupLocationId = fd.pickup_location_id as string | undefined;
    const pickupAt = fd.pickup_at as string | undefined;
    if (!pickupMethod || !pickupLocationId || !pickupAt) {
      throw new BadRequestException({
        code: 'pickup_slot_unavailable',
        reason: 'pending_order_missing_pickup_fields',
      });
    }

    const order = await this.orderService.createOrder(
      pending.session_id,
      null,
      {
        customer_name: fd.customerName as string,
        customer_phone: fd.customerPhone as string,
        customer_email: (fd.customerEmail as string) || undefined,
        customer_address: fd.customerAddress as string,
        notes: (fd.notes as string) || undefined,
        payment_method: 'line',
        customer_line_id: (fd.lineId as string) || undefined,
        skip_cart_clear: true,
        pickup_method: pickupMethod,
        pickup_location_id: pickupLocationId,
        pickup_at: pickupAt,
      },
      cartSnapshot,
    );

    await this.orderService.assignUserToOrder(order.id, authResult.user.id);
    await this.authService.mergeSessionOnLogin(pending.session_id, authResult.user.id);

    try {
      await this.lineService.sendOrderToAdmin(order.id);
      console.log('LINE admin message sent for order', order.id);
    } catch (adminErr) {
      console.error('LINE admin message failed:', adminErr);
    }

    try {
      const { data: profile } = await this.supabaseService
        .getClient()
        .from('profiles')
        .select('line_user_id')
        .eq('id', authResult.user.id)
        .single();

      if (profile?.line_user_id) {
        await this.lineService.sendOrderMessage(order.id, profile.line_user_id);
        console.log('LINE customer message sent to', profile.line_user_id);
      } else {
        console.log('LINE customer message skipped: no line_user_id in profile');
      }
    } catch (customerErr) {
      console.error('LINE customer message failed:', customerErr);
    }

    try {
      await this.orderService.confirmOrder(order.id, pending.session_id, authResult.user.id);
    } catch {
      // Non-critical: the order was already created.
    }

    return this.withAuthHash(`${frontendUrl}/checkout/success?order=${order.order_number}`, {
      access_token: authResult.access_token,
      refresh_token: authResult.refresh_token,
    });
  }

  private withAuthHash(
    url: string,
    auth: { access_token?: string; refresh_token?: string },
  ): string {
    if (!auth.access_token) {
      return url;
    }

    const tokenParams = new URLSearchParams({ access_token: auth.access_token });
    if (auth.refresh_token) {
      tokenParams.set('refresh_token', auth.refresh_token);
    }

    return `${url}#${tokenParams.toString()}`;
  }
}
