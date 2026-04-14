import { CART_CONSTANTS, CartResponse } from '@repo/shared';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class CartService {
  constructor(private supabaseService: SupabaseService) {}

  private async findActiveCartByUserId(
    userId: string,
  ): Promise<{ id: string; version: number } | null> {
    const { data } = await this.supabaseService
      .getClient()
      .from('carts')
      .select('id, version')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();

    return data;
  }

  private async findActiveCartBySessionId(
    sessionId: string,
  ): Promise<{ id: string; version: number } | null> {
    const { data } = await this.supabaseService
      .getClient()
      .from('carts')
      .select('id, version')
      .eq('session_id', sessionId)
      .eq('status', 'active')
      .maybeSingle();

    return data;
  }

  private async mergeCartLines(sourceCartId: string, targetCartId: string): Promise<void> {
    const supabase = this.supabaseService.getClient();
    const { data: sourceLines } = await supabase
      .from('cart_lines')
      .select('product_id, quantity')
      .eq('cart_id', sourceCartId);

    for (const line of sourceLines || []) {
      await supabase.rpc('upsert_cart_line', {
        p_cart_id: targetCartId,
        p_product_id: line.product_id,
        p_quantity: line.quantity,
      });
    }

    await supabase
      .from('carts')
      .update({ status: 'merged', merged_into_cart_id: targetCartId })
      .eq('id', sourceCartId);
  }

  private async recoverCartAfterCreateConflict(
    sessionId: string,
    userId?: string,
  ): Promise<{ id: string; version: number } | null> {
    const supabase = this.supabaseService.getClient();
    const userCart = userId ? await this.findActiveCartByUserId(userId) : null;
    const sessionCart = await this.findActiveCartBySessionId(sessionId);
    const recoveredCart = userCart ?? sessionCart;

    if (!recoveredCart) {
      return null;
    }

    if (userId) {
      await supabase
        .from('carts')
        .update({ user_id: userId, session_id: sessionId })
        .eq('id', recoveredCart.id);
    }

    return recoveredCart;
  }

  /**
   * Resolve the single active cart for the actor.
   * Prefers user-owned cart if userId is provided, falls back to session cart.
   * Creates a new cart lazily if none exists.
   */
  async resolveCart(sessionId: string, userId?: string): Promise<{ id: string; version: number }> {
    const supabase = this.supabaseService.getClient();
    const sessionCart = await this.findActiveCartBySessionId(sessionId);

    if (userId) {
      const userCart = await this.findActiveCartByUserId(userId);

      if (userCart && sessionCart && userCart.id !== sessionCart.id) {
        await this.mergeCartLines(sessionCart.id, userCart.id);
        await supabase
          .from('carts')
          .update({ user_id: userId, session_id: sessionId })
          .eq('id', userCart.id);
        await supabase.rpc('refresh_cart_aggregates', { p_cart_id: userCart.id });
        return (await this.findActiveCartByUserId(userId)) ?? userCart;
      }

      if (userCart) {
        await supabase
          .from('carts')
          .update({ user_id: userId, session_id: sessionId })
          .eq('id', userCart.id);
        return (await this.findActiveCartByUserId(userId)) ?? userCart;
      }

      if (sessionCart) {
        await supabase
          .from('carts')
          .update({ user_id: userId, session_id: sessionId })
          .eq('id', sessionCart.id);
        return (await this.findActiveCartByUserId(userId)) ?? sessionCart;
      }
    }

    if (sessionCart) return sessionCart;

    const { data: newCart, error } = await supabase
      .from('carts')
      .insert({
        session_id: sessionId,
        user_id: userId || null,
      })
      .select('id, version')
      .single();

    if (error || !newCart) {
      const recoveredCart = await this.recoverCartAfterCreateConflict(sessionId, userId);
      if (recoveredCart) {
        return recoveredCart;
      }
      throw new BadRequestException('Failed to create cart');
    }
    return newCart;
  }

  async getCart(sessionId: string, userId?: string): Promise<CartResponse> {
    const supabase = this.supabaseService.getClient();

    let cart: { id: string; version: number } | null = null;

    if (userId) {
      const { data } = await supabase
        .from('carts')
        .select('id, version')
        .eq('user_id', userId)
        .eq('status', 'active')
        .maybeSingle();
      cart = data;
    }

    if (!cart) {
      const { data } = await supabase
        .from('carts')
        .select('id, version')
        .eq('session_id', sessionId)
        .eq('status', 'active')
        .maybeSingle();
      cart = data;
    }

    if (!cart) {
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

    return this.buildCartResponse(cart.id, cart.version);
  }

  async addItem(sessionId: string, productId: number, quantity: number, userId?: string) {
    const supabase = this.supabaseService.getClient();

    const { data: product } = await supabase
      .from('products')
      .select('id')
      .eq('id', productId)
      .eq('is_active', true)
      .single();

    if (!product) throw new BadRequestException('Product not found or inactive');

    const cart = await this.resolveCart(sessionId, userId);

    const { error } = await supabase.rpc('upsert_cart_line', {
      p_cart_id: cart.id,
      p_product_id: productId,
      p_quantity: quantity,
    });

    if (error) throw error;

    await supabase.rpc('refresh_cart_aggregates', { p_cart_id: cart.id });

    return this.getCart(sessionId, userId);
  }

  async updateItem(sessionId: string, cartLineId: string, quantity: number, userId?: string) {
    const supabase = this.supabaseService.getClient();
    const cart = await this.resolveCart(sessionId, userId);

    const { data, error } = await supabase
      .from('cart_lines')
      .update({ quantity })
      .eq('id', cartLineId)
      .eq('cart_id', cart.id)
      .select()
      .single();

    if (error || !data) throw new NotFoundException('Cart item not found');

    await supabase.rpc('refresh_cart_aggregates', { p_cart_id: cart.id });

    return this.getCart(sessionId, userId);
  }

  async removeItem(sessionId: string, cartLineId: string, userId?: string) {
    const supabase = this.supabaseService.getClient();
    const cart = await this.resolveCart(sessionId, userId);

    const { error } = await supabase
      .from('cart_lines')
      .delete()
      .eq('id', cartLineId)
      .eq('cart_id', cart.id);

    if (error) throw error;

    await supabase.rpc('refresh_cart_aggregates', { p_cart_id: cart.id });

    return this.getCart(sessionId, userId);
  }

  async clearCart(sessionId: string, userId?: string): Promise<CartResponse> {
    const supabase = this.supabaseService.getClient();

    let cart: { id: string; version: number } | null = null;

    if (userId) {
      const { data } = await supabase
        .from('carts')
        .select('id, version')
        .eq('user_id', userId)
        .eq('status', 'active')
        .maybeSingle();
      cart = data;
    }

    if (!cart) {
      const { data } = await supabase
        .from('carts')
        .select('id, version')
        .eq('session_id', sessionId)
        .eq('status', 'active')
        .maybeSingle();
      cart = data;
    }

    if (cart) {
      await supabase.from('cart_lines').delete().eq('cart_id', cart.id);
      await supabase.rpc('refresh_cart_aggregates', { p_cart_id: cart.id });
    }

    return {
      cart_id: cart?.id || null,
      version: cart ? cart.version + 1 : 0,
      items: [],
      subtotal: 0,
      shipping_fee: 0,
      total: 0,
      item_count: 0,
    };
  }

  private async buildCartResponse(cartId: string, version: number): Promise<CartResponse> {
    const supabase = this.supabaseService.getClient();

    const { data: lines, error } = await supabase
      .from('cart_lines')
      .select(
        `
        id,
        product_id,
        quantity,
        product:products(
          id,
          name_zh,
          name_en,
          price,
          image_url,
          category:categories(name_zh, name_en)
        )
      `,
      )
      .eq('cart_id', cartId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    const cartItems = (lines || []).map((item: any) => ({
      id: item.id,
      product_id: item.product_id,
      quantity: item.quantity,
      product: {
        id: item.product.id,
        name_zh: item.product.name_zh,
        name_en: item.product.name_en,
        price: item.product.price,
        image_url: item.product.image_url,
        category_name_zh: item.product.category.name_zh,
        category_name_en: item.product.category.name_en,
      },
      line_total: item.quantity * item.product.price,
    }));

    const subtotal = cartItems.reduce((sum: number, item: any) => sum + item.line_total, 0);
    const shipping_fee =
      subtotal >= CART_CONSTANTS.FREE_SHIPPING_THRESHOLD
        ? 0
        : subtotal === 0
          ? 0
          : CART_CONSTANTS.SHIPPING_FEE;

    return {
      cart_id: cartId,
      version,
      items: cartItems,
      subtotal,
      shipping_fee,
      total: subtotal + shipping_fee,
      item_count: cartItems.reduce((sum: number, item: any) => sum + item.quantity, 0),
    };
  }
}
