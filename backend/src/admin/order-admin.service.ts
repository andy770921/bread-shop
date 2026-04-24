import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { OrderStatus } from '@repo/shared';
import { SupabaseService } from '../supabase/supabase.service';
import { LineService } from '../line/line.service';
import { OrderService } from '../order/order.service';

@Injectable()
export class OrderAdminService {
  private static readonly ADMIN_BLOCKED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
    pending: [],
    paid: [],
    preparing: [],
    shipping: [],
    delivered: ['pending', 'paid'],
    cancelled: ['delivered', 'shipping'],
  };

  constructor(
    private supabase: SupabaseService,
    private orderService: OrderService,
    private lineService: LineService,
  ) {}

  async list(params: { status?: string; page?: number; pageSize?: number }) {
    const supabase = this.supabase.getClient();
    const pageSize = Math.min(Math.max(params.pageSize ?? 20, 1), 100);
    const page = Math.max(params.page ?? 1, 1);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('orders')
      .select(
        `id, order_number, status, subtotal, shipping_fee, total,
         customer_name, customer_phone, payment_method, line_user_id,
         pickup_method, pickup_at,
         pickup_location:pickup_locations ( label_zh, label_en ),
         created_at, updated_at`,
        { count: 'exact' },
      )
      .order('created_at', { ascending: false })
      .range(from, to);

    if (params.status) {
      query = query.eq('status', params.status);
    }

    const { data, error, count } = await query;
    if (error) throw new BadRequestException(error.message);
    return {
      orders: (data ?? []).map((o: any) => ({
        ...o,
        pickup_location_label_zh: o.pickup_location?.label_zh ?? null,
        pickup_location_label_en: o.pickup_location?.label_en ?? null,
        pickup_location: undefined,
      })),
      total: count ?? 0,
      page,
      pageSize,
    };
  }

  async detail(orderId: number) {
    const supabase = this.supabase.getClient();
    const { data, error } = await supabase
      .from('orders')
      .select(
        `*, items:order_items(*),
         pickup_location:pickup_locations ( label_zh, label_en )`,
      )
      .eq('id', orderId)
      .single();
    if (error || !data) throw new NotFoundException('Order not found');
    const pickup = (data as any).pickup_location ?? null;
    return {
      ...(data as any),
      pickup_location_label_zh: pickup?.label_zh ?? null,
      pickup_location_label_en: pickup?.label_en ?? null,
      pickup_location: undefined,
    };
  }

  async updateStatus(orderId: number, newStatus: OrderStatus) {
    const supabase = this.supabase.getClient();
    const { data: order, error: fetchErr } = await supabase
      .from('orders')
      .select('id, status')
      .eq('id', orderId)
      .maybeSingle();

    if (fetchErr) throw new BadRequestException(fetchErr.message);
    if (!order) throw new NotFoundException('Order not found');
    if (order.status === newStatus) return order;

    const blocked = OrderAdminService.ADMIN_BLOCKED_TRANSITIONS[order.status as OrderStatus] ?? [];
    if (blocked.includes(newStatus)) {
      throw new BadRequestException(`Cannot transition from '${order.status}' to '${newStatus}'`);
    }

    const { data, error } = await supabase
      .from('orders')
      .update({ status: newStatus })
      .eq('id', orderId)
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async resendLine(orderId: number) {
    const supabase = this.supabase.getClient();
    const { data: order, error } = await supabase
      .from('orders')
      .select('id, line_user_id, user_id')
      .eq('id', orderId)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!order) throw new NotFoundException('Order not found');

    let lineUserId = order.line_user_id as string | null;
    if (!lineUserId && order.user_id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('line_user_id')
        .eq('id', order.user_id)
        .maybeSingle();
      lineUserId = profile?.line_user_id ?? null;
    }

    if (!lineUserId) {
      throw new ConflictException({
        reason: 'no_line_user',
        message: 'No LINE user associated with this order',
      });
    }

    const canPush = await this.lineService.canPushToUser(lineUserId);
    if (!canPush) {
      throw new ConflictException({
        reason: 'not_friend',
        message: 'Customer is not a friend of the official account',
      });
    }

    await this.lineService.sendOrderMessage(orderId, lineUserId);
    return { success: true };
  }
}
