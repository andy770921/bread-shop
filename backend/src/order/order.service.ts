import { CART_CONSTANTS, CartResponse, Order, OrderStatus } from '@repo/shared';
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CartService } from '../cart/cart.service';

type CheckoutCartSnapshotInput = Partial<CartResponse> & {
  items?: Array<{
    product_id?: number;
    quantity?: number;
  }>;
};

@Injectable()
export class OrderService {
  private static readonly VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
    pending: ['paid', 'cancelled'],
    paid: ['preparing', 'cancelled'],
    preparing: ['shipping', 'cancelled'],
    shipping: ['delivered'],
    delivered: [],
    cancelled: [],
  };

  constructor(
    private supabaseService: SupabaseService,
    private cartService: CartService,
  ) {}

  async getCartForSession(sessionId: string, userId?: string) {
    return this.cartService.getCart(sessionId, userId);
  }

  async getCheckoutCartSnapshot(
    sessionId: string,
    userId?: string,
    cartSnapshot?: CheckoutCartSnapshotInput,
  ): Promise<CartResponse> {
    if (cartSnapshot?.items?.length) {
      return this.normalizeCheckoutCart(cartSnapshot);
    }

    return this.cartService.getCart(sessionId, userId);
  }

  async createOrder(
    sessionId: string,
    userId: string | null,
    dto: {
      customer_name: string;
      customer_phone: string;
      customer_email?: string;
      customer_address: string;
      notes?: string;
      payment_method: 'line';
      customer_line_id?: string;
      skip_cart_clear?: boolean;
      cart_snapshot?: CheckoutCartSnapshotInput;
    },
    cartOverride?: CheckoutCartSnapshotInput,
  ) {
    const supabase = this.supabaseService.getClient();

    // Use cart override (snapshot from pending order) if provided,
    // otherwise read from session. The override is needed when the
    // session cookie was lost during LINE OAuth redirect on mobile.
    const cart = await this.getCheckoutCartSnapshot(sessionId, userId || undefined, cartOverride);

    if (cart.items.length === 0) {
      throw new BadRequestException('Cart is empty');
    }

    // Canonicalize product data and totals on the server. This keeps checkout
    // safe even when the snapshot originated from client state.
    const productIds = cart.items.map((i) => i.product_id);
    const { data: activeProducts } = await supabase
      .from('products')
      .select(
        `
        id,
        name_zh,
        name_en,
        price,
        image_url,
        category:categories(name_zh, name_en)
      `,
      )
      .in('id', productIds)
      .eq('is_active', true);
    const activeMap = new Map((activeProducts || []).map((p: any) => [p.id, p]));
    const inactiveItems = cart.items.filter((i) => !activeMap.has(i.product_id));
    if (inactiveItems.length > 0) {
      throw new BadRequestException(
        `Some products are no longer available: ${inactiveItems.map((i) => i.product.name_zh).join(', ')}`,
      );
    }

    const canonicalItems = cart.items.map((item) => {
      const product = activeMap.get(item.product_id)!;
      return {
        ...item,
        line_total: item.quantity * product.price,
        product: {
          id: product.id,
          name_zh: product.name_zh,
          name_en: product.name_en,
          price: product.price,
          image_url: product.image_url,
          category_name_zh: product.category.name_zh,
          category_name_en: product.category.name_en,
        },
      };
    });
    const subtotal = canonicalItems.reduce((sum, item) => sum + item.line_total, 0);
    const shipping_fee =
      subtotal >= CART_CONSTANTS.FREE_SHIPPING_THRESHOLD
        ? 0
        : subtotal === 0
          ? 0
          : CART_CONSTANTS.SHIPPING_FEE;
    const total = subtotal + shipping_fee;

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        session_id: sessionId,
        user_id: userId,
        status: 'pending',
        subtotal,
        shipping_fee,
        total,
        customer_name: dto.customer_name,
        customer_phone: dto.customer_phone,
        customer_email: dto.customer_email,
        customer_address: dto.customer_address,
        notes: dto.notes,
        payment_method: dto.payment_method,
        customer_line_id: dto.customer_line_id,
      })
      .select()
      .single();

    if (orderError) throw orderError;

    const orderItems = canonicalItems.map((item) => ({
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

    if (!dto.skip_cart_clear) {
      await this.cartService.clearCart(sessionId, userId || undefined);
    }

    return this.getOrderById(order.id, userId);
  }

  async confirmOrder(orderId: number, sessionId: string, userId: string | null) {
    await this.getOrderWithItemsForActor(orderId, sessionId, userId);

    await this.cartService.clearCart(sessionId, userId || undefined);

    return { success: true };
  }

  private async normalizeCheckoutCart(
    cartSnapshot: CheckoutCartSnapshotInput,
  ): Promise<CartResponse> {
    const quantities = new Map<number, number>();
    const orderedProductIds: number[] = [];

    for (const item of cartSnapshot.items || []) {
      const productId = Number(item.product_id);
      const quantity = Math.min(
        Math.max(Number(item.quantity) || 0, 0),
        CART_CONSTANTS.MAX_ITEM_QUANTITY,
      );

      if (!Number.isInteger(productId) || quantity <= 0) {
        continue;
      }

      if (!quantities.has(productId)) {
        orderedProductIds.push(productId);
        quantities.set(productId, quantity);
        continue;
      }

      quantities.set(
        productId,
        Math.min((quantities.get(productId) || 0) + quantity, CART_CONSTANTS.MAX_ITEM_QUANTITY),
      );
    }

    if (orderedProductIds.length === 0) {
      return {
        cart_id: null,
        version: 0,
        items: [],
        subtotal: 0,
        shipping_fee: 0,
        total: 0,
        item_count: 0,
      };
    }

    const { data: products } = await this.supabaseService
      .getClient()
      .from('products')
      .select(
        `
        id,
        name_zh,
        name_en,
        price,
        image_url,
        category:categories(name_zh, name_en)
      `,
      )
      .in('id', orderedProductIds)
      .eq('is_active', true);

    const productMap = new Map((products || []).map((product: any) => [product.id, product]));
    const missingIds = orderedProductIds.filter((productId) => !productMap.has(productId));
    if (missingIds.length > 0) {
      throw new BadRequestException('Some products are no longer available.');
    }

    const items = orderedProductIds.map((productId, index) => {
      const product = productMap.get(productId)!;
      const quantity = quantities.get(productId)!;
      return {
        id: -(index + 1),
        product_id: productId,
        quantity,
        product: {
          id: product.id,
          name_zh: product.name_zh,
          name_en: product.name_en,
          price: product.price,
          image_url: product.image_url,
          category_name_zh: product.category.name_zh,
          category_name_en: product.category.name_en,
        },
        line_total: quantity * product.price,
      };
    });

    const subtotal = items.reduce((sum, item) => sum + item.line_total, 0);
    const shipping_fee =
      subtotal >= CART_CONSTANTS.FREE_SHIPPING_THRESHOLD
        ? 0
        : subtotal === 0
          ? 0
          : CART_CONSTANTS.SHIPPING_FEE;

    return {
      cart_id: null,
      version: 0,
      items,
      subtotal,
      shipping_fee,
      total: subtotal + shipping_fee,
      item_count: items.reduce((sum, item) => sum + item.quantity, 0),
    };
  }

  async getOrderWithItems(orderId: number): Promise<Order> {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('orders')
      .select('*, items:order_items(*)')
      .eq('id', orderId)
      .single();

    if (error || !data) throw new NotFoundException('Order not found');

    return data as Order;
  }

  async getOrderWithItemsForActor(
    orderId: number,
    sessionId?: string,
    userId?: string | null,
  ): Promise<Order> {
    const supabase = this.supabaseService.getClient();
    let query = supabase.from('orders').select('*, items:order_items(*)').eq('id', orderId);

    if (userId) {
      query = query.eq('user_id', userId);
    } else if (sessionId) {
      query = query.eq('session_id', sessionId);
    }

    const { data, error } = await query.single();

    if (error || !data) throw new NotFoundException('Order not found');

    return data as Order;
  }

  async getOrderById(orderId: number, userId?: string | null) {
    if (!userId) {
      return this.getOrderWithItems(orderId);
    }

    return this.getOrderWithItemsForActor(orderId, undefined, userId);
  }

  async updateOrderStatus(
    orderId: number,
    newStatus: OrderStatus,
    extra?: Record<string, unknown>,
  ): Promise<void> {
    const order = await this.getOrderWithItems(orderId);
    if (order.status === newStatus) {
      return;
    }
    const validNext = OrderService.VALID_TRANSITIONS[order.status] ?? [];

    if (!validNext.includes(newStatus)) {
      throw new BadRequestException(`Cannot transition from '${order.status}' to '${newStatus}'`);
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('orders')
      .update({ status: newStatus, ...extra })
      .eq('id', orderId)
      .select('id')
      .single();

    if (error || !data) throw new NotFoundException('Order not found');
  }

  async assignUserToOrder(orderId: number, userId: string): Promise<void> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('orders')
      .update({ user_id: userId })
      .eq('id', orderId)
      .select('id')
      .single();

    if (error || !data) throw new NotFoundException('Order not found');
  }

  async attachLineUserId(orderId: number, lineUserId: string): Promise<void> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('orders')
      .update({ line_user_id: lineUserId })
      .eq('id', orderId)
      .select('id')
      .single();

    if (error || !data) throw new NotFoundException('Order not found');
  }

  async getOrderByNumber(orderNumber: string) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('orders')
      .select('id, order_number, status, total, payment_method, created_at')
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
