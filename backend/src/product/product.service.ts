import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class ProductService {
  constructor(private supabaseService: SupabaseService) {}

  async findAll(categorySlug?: string) {
    const supabase = this.supabaseService.getClient();

    let query = supabase
      .from('products')
      .select('*, category:categories(*)')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (categorySlug) {
      query = supabase
        .from('products')
        .select('*, category:categories!inner(*)')
        .eq('is_active', true)
        .eq('categories.slug', categorySlug)
        .order('sort_order', { ascending: true });
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
