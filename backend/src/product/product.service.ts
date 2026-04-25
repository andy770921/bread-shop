import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class ProductService {
  constructor(private supabaseService: SupabaseService) {}

  async findAll(categorySlug?: string) {
    const supabase = this.supabaseService.getClient();

    // Always inner-join `categories` and require `visible_on_home = true` so
    // that admin-hidden categories disappear from every public listing
    // (the "全部" pill, deep links, search). Strict hiding semantics — see
    // documents/FEAT-8/development/admin-frontend-category-flag.md.
    let query = supabase
      .from('products')
      .select('*, category:categories!inner(*)')
      .eq('is_active', true)
      .eq('categories.visible_on_home', true)
      .order('sort_order', { ascending: true });

    if (categorySlug) {
      query = query.eq('categories.slug', categorySlug);
    }

    const { data, error } = await query;
    if (error) throw error;

    return { products: data };
  }

  async findOne(id: number) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('products')
      .select('*, category:categories(*)')
      .eq('id', id)
      .eq('is_active', true)
      .single();

    if (error || !data) throw new NotFoundException('Product not found');

    return data;
  }
}
