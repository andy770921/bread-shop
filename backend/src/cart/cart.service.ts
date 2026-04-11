import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class CartService {
  constructor(private supabaseService: SupabaseService) {}

  private async getSessionIds(sessionId: string, userId?: string): Promise<string[]> {
    if (!userId) return [sessionId];

    const supabase = this.supabaseService.getClient();
    const { data } = await supabase.from('sessions').select('id').eq('user_id', userId);

    return data?.map((s) => s.id) || [sessionId];
  }

  async getCart(sessionId: string, userId?: string) {
    const supabase = this.supabaseService.getClient();
    const sessionIds = await this.getSessionIds(sessionId, userId);

    const { data: items, error } = await supabase
      .from('cart_items')
      .select(
        `
        id,
        session_id,
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
      .in('session_id', sessionIds)
      .order('created_at', { ascending: true });

    if (error) throw error;

    const cartItems = (items || []).map((item: any) => ({
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
    const shipping_fee = subtotal >= 500 ? 0 : subtotal === 0 ? 0 : 60;

    return {
      items: cartItems,
      subtotal,
      shipping_fee,
      total: subtotal + shipping_fee,
      item_count: cartItems.reduce((sum: number, item: any) => sum + item.quantity, 0),
    };
  }

  async addItem(sessionId: string, productId: number, quantity: number) {
    const supabase = this.supabaseService.getClient();

    const { data: product } = await supabase
      .from('products')
      .select('id')
      .eq('id', productId)
      .eq('is_active', true)
      .single();

    if (!product) throw new BadRequestException('Product not found or inactive');

    const { error } = await supabase.rpc('upsert_cart_item', {
      p_session_id: sessionId,
      p_product_id: productId,
      p_quantity: quantity,
    });

    if (error) throw error;

    return this.getCart(sessionId);
  }

  async updateItem(sessionId: string, cartItemId: number, quantity: number, userId?: string) {
    const supabase = this.supabaseService.getClient();
    const sessionIds = await this.getSessionIds(sessionId, userId);

    const { data, error } = await supabase
      .from('cart_items')
      .update({ quantity })
      .eq('id', cartItemId)
      .in('session_id', sessionIds)
      .select()
      .single();

    if (error || !data) throw new NotFoundException('Cart item not found');

    return this.getCart(sessionId, userId);
  }

  async removeItem(sessionId: string, cartItemId: number, userId?: string) {
    const supabase = this.supabaseService.getClient();
    const sessionIds = await this.getSessionIds(sessionId, userId);

    const { error } = await supabase
      .from('cart_items')
      .delete()
      .eq('id', cartItemId)
      .in('session_id', sessionIds);

    if (error) throw error;

    return this.getCart(sessionId, userId);
  }

  async clearCart(sessionId: string, userId?: string) {
    const supabase = this.supabaseService.getClient();
    const sessionIds = await this.getSessionIds(sessionId, userId);

    await supabase.from('cart_items').delete().in('session_id', sessionIds);

    return { items: [], subtotal: 0, shipping_fee: 0, total: 0, item_count: 0 };
  }
}
