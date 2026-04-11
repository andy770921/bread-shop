import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class FavoriteService {
  constructor(private supabaseService: SupabaseService) {}

  async getAll(userId: string) {
    const supabase = this.supabaseService.getClient();

    const { data } = await supabase.from('favorites').select('product_id').eq('user_id', userId);

    return { product_ids: data?.map((f) => f.product_id) || [] };
  }

  async add(userId: string, productId: number) {
    const supabase = this.supabaseService.getClient();

    await supabase
      .from('favorites')
      .upsert({ user_id: userId, product_id: productId }, { onConflict: 'user_id,product_id' });

    return { success: true };
  }

  async remove(userId: string, productId: number) {
    const supabase = this.supabaseService.getClient();

    await supabase.from('favorites').delete().eq('user_id', userId).eq('product_id', productId);

    return { success: true };
  }
}
