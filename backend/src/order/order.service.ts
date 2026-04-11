import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CartService } from '../cart/cart.service';

@Injectable()
export class OrderService {
  constructor(
    private supabaseService: SupabaseService,
    private cartService: CartService,
  ) {}

  async createOrder(
    sessionId: string,
    userId: string | null,
    dto: {
      customer_name: string;
      customer_phone: string;
      customer_email?: string;
      customer_address: string;
      notes?: string;
      payment_method: 'lemon_squeezy' | 'line';
    },
  ) {
    const supabase = this.supabaseService.getClient();

    const cart = await this.cartService.getCart(
      sessionId,
      userId || undefined,
    );

    if (cart.items.length === 0) {
      throw new BadRequestException('Cart is empty');
    }

    // Validate all products are still active
    const productIds = cart.items.map((i) => i.product_id);
    const { data: activeProducts } = await supabase
      .from('products')
      .select('id')
      .in('id', productIds)
      .eq('is_active', true);
    const activeIds = new Set(activeProducts?.map((p) => p.id) || []);
    const inactiveItems = cart.items.filter(
      (i) => !activeIds.has(i.product_id),
    );
    if (inactiveItems.length > 0) {
      throw new BadRequestException(
        `Some products are no longer available: ${inactiveItems.map((i) => i.product.name_zh).join(', ')}`,
      );
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        session_id: sessionId,
        user_id: userId,
        status: 'pending',
        subtotal: cart.subtotal,
        shipping_fee: cart.shipping_fee,
        total: cart.total,
        customer_name: dto.customer_name,
        customer_phone: dto.customer_phone,
        customer_email: dto.customer_email,
        customer_address: dto.customer_address,
        notes: dto.notes,
        payment_method: dto.payment_method,
      })
      .select()
      .single();

    if (orderError) throw orderError;

    const orderItems = cart.items.map((item) => ({
      order_id: order.id,
      product_id: item.product_id,
      product_name_zh: item.product.name_zh,
      product_name_en: item.product.name_en,
      product_price: item.product.price,
      quantity: item.quantity,
      subtotal: item.line_total,
    }));

    const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
    if (itemsError) throw new BadRequestException('Failed to create order items');

    await this.cartService.clearCart(sessionId, userId || undefined);

    return this.getOrderById(order.id, userId);
  }

  async getOrderById(orderId: number, userId?: string | null) {
    const supabase = this.supabaseService.getClient();

    let query = supabase
      .from('orders')
      .select('*, items:order_items(*)')
      .eq('id', orderId);

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query.single();

    if (error || !data) throw new NotFoundException('Order not found');

    return data;
  }

  async getOrderByNumber(orderNumber: string) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('orders')
      .select(
        'id, order_number, status, total, payment_method, created_at',
      )
      .eq('order_number', orderNumber)
      .single();

    if (error || !data) throw new NotFoundException('Order not found');

    return data;
  }

  async getOrdersByUser(userId: string) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('orders')
      .select(
        'id, order_number, status, subtotal, shipping_fee, total, customer_name, payment_method, created_at, updated_at',
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return { orders: data };
  }
}
